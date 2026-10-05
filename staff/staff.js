/* Staff del EFS 2026: acreditación (entrada, credencial, taller), puerta de taller, búsqueda y coordinación.
   Habla con el Worker del EFS (/staff), que reenvía al Durable Object del evento. Ver docs/EFS_2026_PLAN.md §7 y §9.

   Idea central: el paso 1 se valida contra la lista guardada en el celular, así el resultado aparece al
   instante y con o sin red; en paralelo se le avisa al servidor, que evita que dos puestos acrediten a la
   misma persona. Cada operación lleva un id único: si la red falla se repite tal cual y el servidor
   contesta lo mismo sin duplicar nada. Sin red, los pasos 1 y 2 quedan en una cola; el taller (paso 3)
   necesita conexión, porque el cupo es uno solo para todos los puestos. */
(() => {
  'use strict';

  const RE_ENTRADA = /^EFS26-[0-9A-HJKMNP-TV-Z]{8}$/;
  const RE_CRED = /^EFSC-[0-9A-HJKMNP-TV-Z]{8}$/;
  const LS = { clave: 'efs-staff-clave', puesto: 'efs-staff-puesto', lista: 'efs-staff-lista', cola: 'efs-staff-cola' };
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  let SERVICIO = '';
  let clave = '', puesto = '', claveCoord = '';
  let lista = { entradas: {}, acred: {}, talleres: [], despues: false, total: 0, acreditados: 0 };
  let cola = [];
  let vista = 'acreditar';
  let flujo = null;
  let puertaTaller = '';
  let puertaContador = 0;
  let audio = null;
  let timerListo = 0, timerTalleres = 0, timerCola = 0, timerLista = 0;
  let ultimoAviso = 0;
  let detalleError = ''; // último error técnico de red (se muestra en el ingreso para poder diagnosticar)

  // ─────────── almacenamiento (puede fallar en modo privado: nunca debe frenar la pantalla) ───────────
  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
  const leer = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
  const borrar = (k) => { try { localStorage.removeItem(k); } catch { /* nada */ } };
  const guardarSesion = (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* nada */ } };
  const leerSesion = (k) => { try { return sessionStorage.getItem(k) || ''; } catch { return ''; } };

  const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : 'op-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
  const hhmm = (ms) => new Date(ms).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  // ─────────── red ───────────
  async function api(op, datos = {}, { coord = false, timeout = 8000 } = {}) {
    const cuerpo = { op, ...datos };
    if (coord) cuerpo.clave_coord = claveCoord; else cuerpo.clave = clave;
    const control = new AbortController();
    const t = setTimeout(() => control.abort(), timeout);
    const inicio = performance.now();
    try {
      // text/plain: es un pedido "simple", sin consulta previa (preflight), un viaje menos en cada operación.
      const r = await fetch(SERVICIO + '/staff', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(cuerpo), signal: control.signal });
      let j;
      try { j = await r.json(); } catch (e) { detalleError = 'respuesta no válida (HTTP ' + r.status + ') de ' + r.url; throw e; }
      conexion(performance.now() - inicio > 2500 ? 'lenta' : 'ok');
      return j;
    } catch (e) {
      if (!detalleError || !/respuesta/.test(detalleError)) detalleError = (e && e.name ? e.name : 'Error') + ': ' + (e && e.message ? e.message : '') + ' (' + (SERVICIO || 'sin dirección del servicio') + ')';
      conexion('sin');
      return { ok: false, error: 'red' };
    } finally {
      clearTimeout(t);
    }
  }
  const esRed = (r) => r && (r.error === 'red' || r.error === 'servicio' || r.error === 'interno');

  function conexion(estado) { $('#conexion').dataset.e = estado; }

  // Operación del día con id propio. Si no hay red se guarda en la cola con el MISMO id.
  async function enviarOp(op, datos, { encolar = true } = {}) {
    const cuerpo = { ...datos, id: nuevoId() };
    const r = await api(op, cuerpo, { timeout: 6000 });
    if (r.error === 'clave' || r.error === 'demasiados_intentos') { salir(r.error === 'clave' ? 'La clave ya no es válida.' : 'Demasiados intentos. Esperá unos minutos.'); return r; }
    if (esRed(r)) {
      if (encolar) { cola.push({ op, cuerpo }); guardarCola(); pintarCola(); }
      return { offline: true };
    }
    return r;
  }

  function guardarCola() { guardar(LS.cola, JSON.stringify(cola)); }
  function pintarCola() {
    const el = $('#cCola');
    el.hidden = cola.length === 0;
    el.textContent = cola.length + ' sin enviar';
  }
  async function vaciarCola() {
    if (!cola.length || vaciarCola.enCurso) return;
    vaciarCola.enCurso = true;
    try {
      while (cola.length) {
        const { op, cuerpo } = cola[0];
        const r = await api(op, cuerpo, { timeout: 6000 });
        if (esRed(r)) break;
        cola.shift(); guardarCola(); pintarCola();
      }
    } finally { vaciarCola.enCurso = false; }
  }

  // ─────────── lista local ───────────
  function aplicarLista(r) {
    const entradas = {};
    for (const [c, n, d3, e] of r.entradas) entradas[c] = { n, d3, e };
    // lo acreditado en este celular y todavía sin enviar no se pierde al refrescar
    const acred = { ...r.acred };
    for (const item of cola) if (item.op === 'acreditar' && !acred[item.cuerpo.codigo]) acred[item.cuerpo.codigo] = Date.now();
    lista = { entradas, acred, talleres: r.talleres || [], despues: Boolean(r.despues), total: r.total, acreditados: r.acreditados };
    guardar(LS.lista, JSON.stringify(lista));
    pintarContadores();
  }
  function cargarListaGuardada() {
    try { const g = JSON.parse(leer(LS.lista)); if (g && g.entradas) lista = g; } catch { /* sin lista guardada */ }
  }
  // La primera vez el servidor puede necesitar trabajar con la planilla: se le da más tiempo (ingreso).
  async function refrescarLista(timeout = 8000) {
    const r = await api('lista', {}, { timeout });
    if (r.ok) aplicarLista(r);
    return r;
  }
  async function refrescarTalleres() {
    const r = await api('talleres', {}, { timeout: 4000 });
    if (r.ok) {
      lista.talleres = r.talleres; lista.despues = Boolean(r.despues); lista.acreditados = r.acreditados;
      pintarContadores();
      if (flujo && flujo.fase === 'taller') pintarTalleres();
      if (vista === 'puerta') pintarPuertaTalleres();
    }
  }
  function pintarContadores() {
    $('#cAcred').textContent = lista.acreditados ?? '–';
    $('#cTotal').textContent = lista.total ?? '–';
  }

  // ─────────── sonido y destello ───────────
  function preparar() {
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch { audio = null; }
  }
  function tono(frec, dur, retraso = 0) {
    if (!audio) return;
    const o = audio.createOscillator(), g = audio.createGain(), t0 = audio.currentTime + retraso;
    o.type = 'sine'; o.frequency.value = frec;
    g.gain.setValueAtTime(0.3, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(audio.destination); o.start(t0); o.stop(t0 + dur);
  }
  function feedback(color) {
    const d = $('#destello');
    d.dataset.c = color; d.classList.add('on');
    setTimeout(() => d.classList.remove('on'), 380);
    if (color === 'verde') { tono(880, 0.14); navigator.vibrate?.(60); }
    else if (color === 'ambar') { tono(520, 0.12); tono(520, 0.12, 0.18); navigator.vibrate?.([80, 60, 80]); }
    else { tono(180, 0.4); navigator.vibrate?.(300); }
  }

  // ─────────── cámara ───────────
  const cam = { stream: null, timer: 0, ultimo: '', ultimoT: 0, aparte: 0 };
  async function iniciarCamara() {
    if (cam.stream) return;
    const aviso = $('#sinCamara');
    aviso.hidden = true;
    try {
      cam.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
      const v = $('#video');
      v.srcObject = cam.stream;
      await v.play();
      cam.timer = setInterval(decodificar, 90);
    } catch {
      cam.stream = null;
      aviso.textContent = 'No se pudo abrir la cámara. Revisá el permiso del navegador, o usá la pestaña Buscar.';
      aviso.hidden = false;
    }
  }
  function detenerCamara() {
    clearInterval(cam.timer);
    if (cam.stream) cam.stream.getTracks().forEach((t) => t.stop());
    cam.stream = null;
    $('#video').srcObject = null;
  }
  function decodificar() {
    const v = $('#video');
    if (v.readyState < 2 || !v.videoWidth) return;
    const lienzo = $('#lienzo');
    const escala = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
    const w = Math.round(v.videoWidth * escala), h = Math.round(v.videoHeight * escala);
    lienzo.width = w; lienzo.height = h;
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(v, 0, 0, w, h);
    const r = window.jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
    if (r && r.data) alLeer(r.data);
  }
  // El mismo QR frente a la cámara no se repite (3 s), pero otro código distinto se lee al instante.
  function alLeer(texto) {
    const t = String(texto).trim().toUpperCase();
    const ahora = Date.now();
    if (t === cam.ultimo && ahora - cam.ultimoT < 3000) return;
    if (ahora - cam.aparte < 350) return;
    cam.ultimo = t; cam.ultimoT = ahora; cam.aparte = ahora;
    procesar(t);
  }
  function procesar(t) {
    if (vista === 'acreditar') {
      if (RE_ENTRADA.test(t)) return escanearEntrada(t);
      if (RE_CRED.test(t)) return escanearCredencial(t);
      return avisoRojo('No es un QR del EFS');
    }
    if (vista === 'puerta') {
      if (RE_CRED.test(t)) return escanearPuerta(t);
      return avisoPuerta('rojo', 'Escaneá la credencial', 'Ese QR no es una credencial.');
    }
  }

  // ─────────── Acreditar ───────────
  function tarjeta(color, titulo, sub = '', ayuda = '') {
    const t = $('#tarjeta');
    t.dataset.c = color || '';
    t.innerHTML = (titulo ? `<div class="tarjeta__titulo">${esc(titulo)}</div>` : '') + (sub ? `<div class="tarjeta__sub">${sub}</div>` : '') + (ayuda ? `<div class="tarjeta__ayuda">${esc(ayuda)}</div>` : '');
  }
  function avisoRojo(msg) {
    feedback('rojo');
    tarjeta('rojo', msg);
  }
  function pintarPasos() {
    const orden = ['entrada', 'credencial', 'taller'];
    const f = flujo ? flujo.fase : 'entrada';
    $$('#pasos li').forEach((li) => {
      const i = orden.indexOf(li.dataset.paso), actual = f === 'listo' ? 3 : orden.indexOf(f);
      li.className = i < actual ? 'hecho' : i === actual ? 'actual' : '';
    });
    $('#accionesFlujo').hidden = !flujo;
    $('#talleres').hidden = !(flujo && flujo.fase === 'taller');
    clearInterval(timerTalleres);
    if (flujo && flujo.fase === 'taller') { pintarTalleres(); timerTalleres = setInterval(refrescarTalleres, 5000); }
  }
  function reiniciarFlujo() {
    clearTimeout(timerListo);
    flujo = null;
    pintarPasos();
    tarjeta('', '', '', 'Paso 1: escaneá la entrada de la persona.');
  }
  function persona(f) {
    const dni = f.d3 ? `DNI ···${esc(f.d3)}` : '';
    return dni;
  }

  async function escanearEntrada(cod) {
    clearTimeout(timerListo);
    const loc = lista.entradas[cod];
    flujo = { fase: 'credencial', codigo: cod, nombre: loc ? loc.n : '', d3: loc ? loc.d3 : '', cr: '', t: '', tn: '', sinRed: false };
    if (loc && loc.e !== 'activa') { flujo = null; pintarPasos(); return avisoRojo('Entrada revocada · ' + loc.n); }
    if (loc) {
      const ya = lista.acred[cod];
      if (ya) { feedback('ambar'); tarjeta('ambar', loc.n, `<b>Ya acreditado/a</b> a las ${hhmm(ya)}. ${persona(flujo)}`); }
      else { feedback('verde'); tarjeta('verde', loc.n, persona(flujo), 'Ahora escaneá la credencial.'); }
    } else {
      tarjeta('', 'Buscando…', '', 'Ese código no está en la lista de este celular; se consulta al servidor.');
    }
    pintarPasos();

    const r = await enviarOp('acreditar', { codigo: cod, puesto });
    if (!flujo || flujo.codigo !== cod) return; // el staff ya pasó a otra persona
    if (r.offline) {
      if (!loc) { flujo = null; pintarPasos(); return avisoRojo('No figura en la lista y no hay conexión para confirmar'); }
      if (!lista.acred[cod]) lista.acred[cod] = Date.now();
      flujo.sinRed = true;
      return tarjeta('ambar', loc.n, persona(flujo) + ' · <b>Guardado sin conexión</b> (se envía solo)', 'Ahora escaneá la credencial.');
    }
    if (!r.ok) { flujo = null; pintarPasos(); return avisoRojo('Error del servidor. Probá de nuevo.'); }
    flujo.nombre = r.n || flujo.nombre;
    switch (r.r) {
      case 'ok':
        lista.acred[cod] = r.hora; lista.acreditados = Object.keys(lista.acred).length; pintarContadores();
        flujo.cr = r.cr || ''; flujo.t = r.t || ''; flujo.tn = r.tn || '';
        if (!loc) { feedback('verde'); tarjeta('verde', flujo.nombre, '', 'Ahora escaneá la credencial.'); }
        break;
      case 'ya': {
        lista.acred[cod] = r.hora;
        flujo.cr = r.cr || ''; flujo.t = r.t || ''; flujo.tn = r.tn || '';
        feedback('ambar');
        const detalle = `<b>Ya acreditado/a</b> a las ${hhmm(r.hora)}${r.puesto ? ' en ' + esc(r.puesto) : ''}.` + (flujo.cr ? ` Credencial ${esc(flujo.cr)}.` : '') + (flujo.tn ? ` Taller: ${esc(flujo.tn)}.` : '');
        if (flujo.cr && flujo.t) { flujo.fase = 'listo'; tarjeta('ambar', flujo.nombre, detalle + ' No hace falta nada más.'); }
        else if (flujo.cr) { flujo.fase = 'taller'; tarjeta('ambar', flujo.nombre, detalle); }
        else tarjeta('ambar', flujo.nombre, detalle, 'Falta la credencial: escanéala.');
        pintarPasos();
        break;
      }
      case 'revocada': flujo = null; pintarPasos(); avisoRojo('Entrada revocada (pago devuelto)'); break;
      case 'no_valido': case 'formato': flujo = null; pintarPasos(); avisoRojo('No figura entre las entradas del EFS'); break;
      default: flujo = null; pintarPasos(); avisoRojo('Respuesta inesperada');
    }
  }

  async function escanearCredencial(cr) {
    if (!flujo) return avisoRojo('Primero escaneá la entrada de la persona');
    if (flujo.fase === 'listo') return avisoRojo('Esta persona ya está lista. Tocá "Siguiente persona".');
    if (flujo.cr === cr) return;
    const cod = flujo.codigo;
    const r = await enviarOp('vincular', { codigo: cod, credencial: cr, puesto });
    if (!flujo || flujo.codigo !== cod) return;
    if (r.offline) {
      flujo.cr = cr; flujo.sinRed = true; flujo.fase = 'taller';
      feedback('ambar');
      tarjeta('ambar', flujo.nombre, `Credencial ${esc(cr)} <b>guardada sin conexión</b> (se envía sola).`, 'Sin conexión no se puede elegir taller: anotalo en la planilla de papel.');
      return pintarPasos();
    }
    switch (r.r) {
      case 'ok': case 'ya_tiene': {
        flujo.cr = r.r === 'ok' ? cr : r.cr;
        flujo.fase = 'taller';
        feedback(r.r === 'ok' ? 'verde' : 'ambar');
        const nota = r.r === 'ok' ? `Credencial ${esc(cr)} entregada.` : `<b>Ya tenía la credencial ${esc(r.cr)}</b>; se mantiene esa.`;
        tarjeta(r.r === 'ok' ? 'verde' : 'ambar', flujo.nombre, nota, 'Ahora elegí el taller.');
        pintarPasos();
        if (flujo.fase === 'listo') programarSiguiente();
        else refrescarTalleres();
        break;
      }
      case 'credencial_ocupada': avisoRojo('Esa credencial ya es de ' + (r.de || 'otra persona') + '. Usá otra.'); break;
      case 'credencial_desconocida': avisoRojo('Esa credencial no es del EFS'); break;
      case 'revocada': flujo = null; pintarPasos(); avisoRojo('Entrada revocada (pago devuelto)'); break;
      default: avisoRojo('No se pudo vincular la credencial');
    }
  }

  function pintarTalleres() {
    const c = $('#talleres');
    if (!lista.talleres.length) { c.innerHTML = '<p class="ayuda">Todavía no hay talleres cargados. Se crean en la pestaña Coordinar.</p>'; return; }
    const sinRed = flujo && flujo.sinRed;
    c.innerHTML = lista.talleres.map((t) => {
      const libres = Math.max(0, t.cupo - t.ocupados);
      return `<button class="taller${libres ? '' : ' lleno'}" style="--color:${esc(t.color)}" data-id="${esc(t.id)}"${libres && !sinRed ? '' : ' disabled'}><b>${esc(t.nombre)}</b><span>${libres ? libres + (libres === 1 ? ' libre' : ' libres') + ' de ' + t.cupo : 'lleno'}</span></button>`;
    }).join('');
  }

  async function elegirTaller(id) {
    if (!flujo || flujo.fase !== 'taller') return;
    const cod = flujo.codigo;
    $$('#talleres .taller').forEach((b) => (b.disabled = true));
    const r = await enviarOp('taller', { codigo: cod, taller: id }, { encolar: false });
    if (!flujo || flujo.codigo !== cod) return;
    if (r.offline) { avisoRojo('Sin conexión: anotá el taller en la planilla de papel'); return pintarTalleres(); }
    const t = lista.talleres.find((x) => x.id === id);
    if (r.r === 'ok') {
      flujo.t = id; flujo.tn = r.tn || (t && t.nombre) || ''; flujo.fase = 'listo';
      feedback('verde');
      tarjeta('verde', flujo.nombre, `Taller <b>${esc(flujo.tn)}</b>. Pegá el autoadhesivo${t ? ' de color <span class="marca" style="background:' + esc(t.color) + '"></span>' : ''} en la credencial.`);
      pintarPasos();
      refrescarTalleres();
      programarSiguiente();
    } else if (r.r === 'sin_cupo') {
      avisoRojo('Se llenó el taller. Elegí otro.');
      await refrescarTalleres();
    } else {
      avisoRojo('No se pudo asignar el taller');
      pintarTalleres();
    }
  }

  function programarSiguiente() {
    clearTimeout(timerListo);
    timerListo = setTimeout(reiniciarFlujo, 6000);
  }

  // ─────────── Puerta ───────────
  function pintarPuertaTalleres() {
    const c = $('#puertaTalleres');
    if (!lista.talleres.length) { c.innerHTML = '<p class="ayuda">Todavía no hay talleres cargados.</p>'; return; }
    c.innerHTML = lista.talleres.map((t) => `<button class="taller${t.id === puertaTaller ? ' elegido' : ''}" style="--color:${esc(t.color)}" data-id="${esc(t.id)}"><b>${esc(t.nombre)}</b><span>${t.ocupados} anotados</span></button>`).join('');
  }
  function avisoPuerta(color, titulo, sub = '') {
    const t = $('#puertaResultado');
    t.dataset.c = color;
    t.innerHTML = `<div class="tarjeta__titulo">${esc(titulo)}</div>` + (sub ? `<div class="tarjeta__sub">${sub}</div>` : '');
    feedback(color);
  }
  async function escanearPuerta(cr) {
    if (!puertaTaller) return avisoPuerta('ambar', 'Elegí primero el taller de esta puerta');
    const r = await api('puerta', { credencial: cr }, { timeout: 5000 });
    if (esRed(r)) return avisoPuerta('rojo', 'Sin conexión', 'No se puede verificar. Mirá el autoadhesivo de color.');
    if (r.r === 'ok') {
      if (r.t === puertaTaller) { puertaContador++; $('#puertaCuenta').textContent = puertaContador + (puertaContador === 1 ? ' persona verificada' : ' personas verificadas') + ' en esta puerta'; return avisoPuerta('verde', r.n, 'Puede pasar.'); }
      if (!r.t) return avisoPuerta('rojo', r.n, '<b>No tiene taller asignado.</b> Que elija uno en la mesa de acreditación.');
      return avisoPuerta('rojo', r.n, `<b>Es del taller ${esc(r.tn)}</b>, no de este.`);
    }
    if (r.r === 'sin_dueno') return avisoPuerta('rojo', 'Credencial sin asignar', 'No está vinculada a ninguna persona.');
    avisoPuerta('rojo', 'No es una credencial del EFS');
  }

  // ─────────── Buscar ───────────
  async function buscar(q, destino, conCoord) {
    destino.innerHTML = '<li><span class="dato"><span>Buscando…</span></span></li>';
    const r = await api('buscar', { q }, { timeout: 8000 });
    if (esRed(r)) { destino.innerHTML = '<li><span class="dato"><b>Sin conexión</b><span>La búsqueda necesita internet.</span></span></li>'; return; }
    if (!r.ok) { destino.innerHTML = '<li><span class="dato"><b>Escribí al menos 4 números del DNI o 3 letras del apellido.</b></span></li>'; return; }
    if (!r.resultados.length) { destino.innerHTML = '<li><span class="dato"><b>No hay resultados</b></span></li>'; return; }
    destino.innerHTML = r.resultados.map((x) => {
      const estado = x.e !== 'activa' ? 'entrada revocada' : x.acreditado ? 'ya acreditado/a' : 'sin acreditar';
      const botones = conCoord
        ? `<div class="acciones-min">${x.cr ? `<button class="btn" data-acc="desvincular" data-c="${esc(x.c)}">Quitar credencial</button>` : ''}${x.acreditado ? `<button class="btn" data-acc="desacreditar" data-c="${esc(x.c)}">Quitar acreditación</button>` : ''}</div>`
        : (x.e === 'activa' ? `<button class="btn btn--principal" data-acc="acreditar" data-c="${esc(x.c)}">Acreditar</button>` : '');
      return `<li><span class="dato"><b>${esc(x.n)}</b><span>DNI ···${esc(x.d3)} · ${estado}${x.cr ? ' · ' + esc(x.cr) : ''}</span></span>${botones}</li>`;
    }).join('');
  }

  // ─────────── Coordinar ───────────
  async function abrirCoordinar() {
    claveCoord = claveCoord || leerSesion('efs-staff-coord');
    $('#formCoord').hidden = Boolean(claveCoord);
    $('#panelCoord').hidden = !claveCoord;
    if (claveCoord) await cargarPanel();
  }
  async function cargarPanel() {
    const r = await api('coord_resumen', {}, { coord: true });
    if (r.error === 'clave') { claveCoord = ''; guardarSesion('efs-staff-coord', ''); $('#formCoord').hidden = false; $('#panelCoord').hidden = true; return mostrar('#errorCoord', 'Clave de coordinación incorrecta.'); }
    if (esRed(r) || !r.ok) return;
    $('#resumen').textContent = `Acreditados ${r.acreditados} de ${r.total} · con credencial ${r.credenciales} · con taller ${r.con_taller} · sin pasar a la planilla ${r.sin_sincronizar} · credenciales impresas cargadas ${r.credenciales_impresas}`;
    $('#listaTalleres').innerHTML = r.talleres.length ? r.talleres.map((t) => `<li><span class="dato"><b><span class="marca" style="background:${esc(t.color)}"></span>${esc(t.nombre)}</b><span>${t.ocupados} de ${t.cupo} lugares ocupados</span></span><span class="acciones-min"><button class="btn" data-acc="editar" data-id="${esc(t.id)}">Editar</button><button class="btn" data-acc="borrar" data-id="${esc(t.id)}">Borrar</button></span></li>`).join('') : '<li><span class="dato"><b>Todavía no hay talleres</b><span>Cargá el primero acá abajo.</span></span></li>';
    lista.talleres = r.talleres;
    window.__talleresCoord = r.talleres;
  }
  function mostrar(sel, texto) { const e = $(sel); e.textContent = texto; e.hidden = !texto; }
  const coordOp = (op, datos) => api(op, datos, { coord: true });

  // ─────────── navegación ───────────
  function irA(v) {
    vista = v;
    $$('#tabs button').forEach((b) => b.classList.toggle('activa', b.dataset.vista === v));
    for (const [id, nombre] of [['vAcreditar', 'acreditar'], ['vPuerta', 'puerta'], ['vBuscar', 'buscar'], ['vCoordinar', 'coordinar']]) $('#' + id).hidden = nombre !== v;
    const conCamara = v === 'acreditar' || v === 'puerta';
    $('#escaner').hidden = !conCamara;
    if (conCamara) iniciarCamara(); else detenerCamara();
    if (v === 'acreditar' && !flujo) reiniciarFlujo();
    if (v === 'puerta') { pintarPuertaTalleres(); refrescarTalleres(); }
    if (v === 'coordinar') abrirCoordinar();
  }

  function entrar() {
    $('#ingreso').hidden = true;
    $('#app').hidden = false;
    $('#puestoTxt').textContent = puesto;
    try { cola = JSON.parse(leer(LS.cola)) || []; } catch { cola = []; }
    pintarCola(); pintarContadores();
    irA('acreditar');
    clearInterval(timerLista); clearInterval(timerCola);
    timerLista = setInterval(refrescarLista, 60000);
    timerCola = setInterval(vaciarCola, 4000);
    vaciarCola();
  }
  function salir(motivo) {
    detenerCamara();
    clearInterval(timerLista); clearInterval(timerCola); clearInterval(timerTalleres);
    borrar(LS.clave); guardarSesion(LS.clave, ''); clave = '';
    $('#app').hidden = true;
    $('#ingreso').hidden = false;
    mostrar('#errorIngreso', motivo || '');
  }

  // ─────────── eventos ───────────
  $('#formIngreso').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    preparar();
    clave = $('#clave').value.trim();
    puesto = $('#puesto').value.trim().replace(/[^\p{L}\p{N} .'-]/gu, '').slice(0, 20) || 'Puesto';
    mostrar('#errorIngreso', '');
    detalleError = '';
    const boton = $('#formIngreso button[type=submit]');
    boton.disabled = true; boton.textContent = 'Conectando…';
    const r = await refrescarLista(30000);
    boton.disabled = false; boton.textContent = 'Entrar';
    if (r.ok) { guardarSesion(LS.clave, clave); guardar(LS.puesto, puesto); return entrar(); }
    clave = '';
    mostrar('#errorIngreso', r.error === 'clave' ? 'Clave incorrecta.' : r.error === 'demasiados_intentos' ? 'Demasiados intentos. Esperá unos minutos.' : 'No hay conexión con el servidor.' + (detalleError ? ' [' + detalleError + ']' : ''));
  });

  // Cierra la sesión y borra del celular la lista de personas, la clave y lo pendiente (para el final del evento).
  $('#btnSalir').addEventListener('click', () => {
    if (cola.length && !confirm('Hay ' + cola.length + ' operaciones sin enviar. Si salís ahora se pierden. ¿Salir igual?')) return;
    if (!cola.length && !confirm('¿Cerrar la sesión y borrar los datos de este celular?')) return;
    for (const k of Object.values(LS)) borrar(k);
    guardarSesion(LS.clave, '');
    guardarSesion('efs-staff-coord', '');
    location.reload();
  });

  $('#tabs').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b) { preparar(); irA(b.dataset.vista); } });
  $('#talleres').addEventListener('click', (ev) => { const b = ev.target.closest('.taller'); if (b && !b.disabled) elegirTaller(b.dataset.id); });
  $('#btnSiguiente').addEventListener('click', reiniciarFlujo);
  $('#puertaTalleres').addEventListener('click', (ev) => { const b = ev.target.closest('.taller'); if (!b) return; puertaTaller = b.dataset.id; puertaContador = 0; $('#puertaCuenta').textContent = ''; $('#puertaResultado').innerHTML = ''; $('#puertaResultado').dataset.c = ''; pintarPuertaTalleres(); });

  $('#formBuscar').addEventListener('submit', (ev) => { ev.preventDefault(); buscar($('#q').value, $('#resultados'), false); });
  $('#resultados').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-acc=acreditar]');
    if (!b) return;
    irA('acreditar');
    escanearEntrada(b.dataset.c);
  });

  $('#formCoord').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    claveCoord = $('#claveCoord').value.trim();
    guardarSesion('efs-staff-coord', claveCoord);
    mostrar('#errorCoord', '');
    $('#claveCoord').value = '';
    await abrirCoordinar();
  });
  $('#formTaller').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const r = await coordOp('coord_taller', { id: $('#tId').value, nombre: $('#tNombre').value, cupo: Number($('#tCupo').value), color: $('#tColor').value });
    if (!r.ok) return mostrar('#errorTaller', 'Revisá el nombre, el cupo (1 a 2000) y el color.');
    mostrar('#errorTaller', ''); limpiarTaller(); cargarPanel();
  });
  function limpiarTaller() { $('#tId').value = ''; $('#tNombre').value = ''; $('#tCupo').value = ''; $('#tColor').value = '#1B5286'; $('#btnGuardarTaller').textContent = 'Guardar taller'; }
  $('#btnNuevoTaller').addEventListener('click', limpiarTaller);
  $('#listaTalleres').addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const t = (window.__talleresCoord || []).find((x) => x.id === b.dataset.id);
    if (b.dataset.acc === 'editar' && t) { $('#tId').value = t.id; $('#tNombre').value = t.nombre; $('#tCupo').value = t.cupo; $('#tColor').value = t.color; $('#btnGuardarTaller').textContent = 'Guardar cambios'; $('#tNombre').focus(); }
    if (b.dataset.acc === 'borrar' && t && confirm('¿Borrar el taller "' + t.nombre + '"?')) {
      const r = await coordOp('coord_taller_borrar', { taller: t.id });
      if (!r.ok) mostrar('#errorTaller', r.error === 'con_gente' ? 'No se puede borrar: ya hay gente anotada.' : 'No se pudo borrar.');
      else mostrar('#errorTaller', '');
      cargarPanel();
    }
  });
  $('#btnCred').addEventListener('click', async () => {
    const codigos = [...new Set(($('#credLista').value.toUpperCase().match(/EFSC-[0-9A-HJKMNP-TV-Z]{8}/g)) || [])];
    if (!codigos.length) return ($('#credMsg').textContent = 'No encontré ningún código EFSC-XXXXXXXX en lo que pegaste.');
    const r = await coordOp('coord_credenciales', { lista: codigos });
    $('#credMsg').textContent = r.ok ? `Listo: ${r.cargadas} credenciales cargadas.` : 'No se pudo cargar.';
    if (r.ok) { $('#credLista').value = ''; cargarPanel(); }
  });
  $('#formCorregir').addEventListener('submit', (ev) => { ev.preventDefault(); buscar($('#qCorregir').value, $('#corregir'), true); });
  $('#corregir').addEventListener('click', async (ev) => {
    const b = ev.target.closest('button[data-acc]');
    if (!b) return;
    const quitar = b.dataset.acc === 'desvincular' ? 'la credencial' : 'la acreditación (y credencial y taller)';
    if (!confirm('¿Quitar ' + quitar + ' de esta persona?')) return;
    const r = await coordOp('coord_' + b.dataset.acc, { codigo: b.dataset.c });
    b.textContent = r.ok ? 'Hecho' : 'No se pudo'; b.disabled = true;
    await refrescarLista();
  });
  $('#btnSync').addEventListener('click', async (ev) => { ev.target.disabled = true; await coordOp('coord_sincronizar', {}); await cargarPanel(); ev.target.disabled = false; });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) detenerCamara();
    else if (!$('#app').hidden && (vista === 'acreditar' || vista === 'puerta')) iniciarCamara();
  });
  window.addEventListener('online', vaciarCola);

  // ─────────── arranque ───────────
  async function iniciar() {
    try {
      const ev = await (await fetch('../assets/data/evento.json', { cache: 'no-store' })).json();
      SERVICIO = String((ev.inscripcion && ev.inscripcion.servicio) || '').replace(/\/$/, '');
    } catch { /* se intenta con el valor guardado */ }
    const forzado = new URLSearchParams(location.search).get('servicio');
    if (local && forzado) SERVICIO = forzado.replace(/\/$/, '');
    cargarListaGuardada();
    // La clave vive solo en sessionStorage (se borra al cerrar la pestaña). Si quedó una copia vieja en localStorage, se borra.
    clave = leerSesion(LS.clave); borrar(LS.clave); puesto = leer(LS.puesto);
    $('#puesto').value = puesto;
    if (clave && puesto) {
      const r = await refrescarLista(30000);
      if (r.ok || esRed(r)) return entrar(); // sin red igual se entra con la lista guardada
    }
    $('#ingreso').hidden = false;
  }
  if (local) window.__staff = { procesar: alLeer, estado: () => ({ flujo, lista, cola, vista }) };
  iniciar();
})();
