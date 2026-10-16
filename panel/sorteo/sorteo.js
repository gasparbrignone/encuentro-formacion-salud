/* Sorteo en vivo del EFS 2026 (efsarg.com.ar/panel/sorteo/).
   Participan solo las entradas activas que se acreditaron hoy. La lista sale del mismo Durable Object
   que usan los celulares del staff (POST /staff, op "lista"), así que está al día al segundo y no
   depende de que la planilla se haya sincronizado. Solo lee: no cambia nada del evento.
   Lo que se sortea (ganadores, ausentes) queda guardado en este navegador, por si se recarga la página. */
(() => {
  'use strict';

  const DEMO = new URLSearchParams(location.search).has('demo');
  const GUARDADO = DEMO ? 'efs-sorteo-demo' : 'efs-sorteo-2026';
  const SESION_CLAVE = 'efs-sorteo-clave';
  const REFRESCO_MS = 30000;
  const GIRO_MS = 6500;

  const PREMIOS_BASE = [
    { id: 'libro-medicina-interna', corto: 'Medicina interna', titulo: 'Manual de medicina interna', detalle: 'Cálculos, scores y abordajes. Bartolomei, Aranalde y Keller', foto: 'img/libro-medicina-interna.webp', logo: 'img/logo-corpus.webp', sponsor: 'Corpus' },
    { id: 'libro-obstetricia', corto: 'Obstetricia', titulo: 'Temas de obstetricia', detalle: 'Edgar Zanuttini', foto: 'img/libro-obstetricia.webp', logo: 'img/logo-corpus.webp', sponsor: 'Corpus' },
    { id: 'libro-ginecologia', corto: 'Ginecología', titulo: 'Ginecología', detalle: 'Roberto Italo Tozzini y colaboradores', foto: 'img/libro-ginecologia.webp', logo: 'img/logo-corpus.webp', sponsor: 'Corpus' },
    { id: 'libro-vasculitis', corto: 'Vasculitis', titulo: 'Vasculitis sistémicas', detalle: 'Toma de decisiones. Battagliotti, Berbotto, Kilstein y Pons-Estel', foto: 'img/libro-vasculitis.webp', logo: 'img/logo-corpus.webp', sponsor: 'Corpus' },
    { id: 'libro-fisiologia-renal', corto: 'Fisiología renal', titulo: 'Fisiología renal', detalle: 'Aranalde, Mujica, Agüero y Veitz', foto: 'img/libro-fisiologia-renal.webp', logo: 'img/logo-corpus.webp', sponsor: 'Corpus' },
    { id: 'libro-cirugia', corto: 'Cirugía', titulo: 'Cirugía', detalle: 'Conceptos básicos en medicina vascular. José Luis Ameriso', foto: 'img/libro-cirugia.webp', logo: 'img/logo-corpus.webp', sponsor: 'Corpus' },
    { id: 'ambo', corto: 'Ambo Nube', titulo: 'Un ambo modelo Nube', detalle: '', foto: 'img/ambo.webp', logo: 'img/logo-holy.webp', sponsor: 'Holy' },
    { id: 'kit', corto: 'Kit de enfermería', titulo: 'Un kit de enfermería', detalle: 'Tensiómetro, estetoscopio, oxímetro, termómetro, torniquete y linterna', foto: 'img/kit.webp', logo: 'img/logo-rex.webp', sponsor: 'Cirugía Rex' },
  ];

  const $ = (s) => document.querySelector(s);
  const escenario = $('#escenario');

  let SERVICIO = '';
  let clave = '';
  let personas = []; // acreditados con entrada activa: { c, n, d3 }
  let girando = false;
  let temporizador = null;

  // ─────────── estado guardado ───────────
  let estado = leerEstado();
  function leerEstado() {
    const base = { extras: [], ganadores: {}, ausentes: {}, actual: PREMIOS_BASE[0].id, sonido: true };
    try { return Object.assign(base, JSON.parse(localStorage.getItem(GUARDADO) || '{}')); } catch { return base; }
  }
  function guardar() {
    try { localStorage.setItem(GUARDADO, JSON.stringify(estado)); } catch { /* sin almacenamiento: sigue andando igual */ }
  }
  const premios = () => PREMIOS_BASE.concat(estado.extras);
  const premio = (id) => premios().find((p) => p.id === id) || premios()[0];

  // ─────────── utilidades ───────────
  const MENORES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'di', 'van', 'von']);
  // En la planilla los nombres vienen como los escribió cada persona (TODO EN MAYÚSCULAS, todo en minúsculas…).
  function nombreLindo(s) {
    return String(s || '').toLowerCase().split(/\s+/).filter(Boolean).map((w, i) =>
      (i > 0 && MENORES.has(w)) ? w : w.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('-')
    ).join(' ');
  }

  // Entero al azar entre 0 y n-1, sin sesgo (crypto + rechazo).
  function azar(n) {
    const tope = Math.floor(0x100000000 / n) * n;
    const buf = new Uint32Array(1);
    do { crypto.getRandomValues(buf); } while (buf[0] >= tope);
    return buf[0] % n;
  }

  function toast(texto) {
    const t = $('#toast');
    t.textContent = texto;
    t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { t.hidden = true; }, 3200);
  }

  const hhmm = (d) => d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  // ─────────── sonido (sintetizado, sin archivos) ───────────
  let audio = null;
  function ctx() {
    if (!estado.sonido) return null;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      return audio;
    } catch { return null; }
  }
  function nota(frec, inicio, dur, vol, tipo) {
    const a = ctx();
    if (!a) return;
    const t0 = a.currentTime + inicio;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = tipo || 'sine';
    o.frequency.value = frec;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  const tic = (avance) => nota(700 + avance * 700, 0, 0.05, 0.12, 'square');
  function campanita() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => nota(f, i * 0.09, 0.5, 0.18, 'triangle'));
    [1, 2.76, 5.4].forEach((k, i) => nota(1046.5 * k, 0.4, 2.2 - i * 0.5, 0.12 / (i + 1)));
  }

  // ─────────── papelitos (colores de la paleta) ───────────
  function papelitos() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = $('#papelitos');
    const r = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cv.width = r.width * dpr;
    cv.height = r.height * dpr;
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    const colores = ['#16283F', '#1B5286', '#2C6FA0', '#5AA6CC', '#1C7A72', '#4FA69C'];
    const piezas = Array.from({ length: 180 }, () => ({
      x: r.width * (0.1 + Math.random() * 0.8), y: r.height * 0.45,
      vx: (Math.random() - 0.5) * 18, vy: -8 - Math.random() * 14,
      w: 8 + Math.random() * 10, h: 5 + Math.random() * 7, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4,
      c: colores[Math.floor(Math.random() * colores.length)],
    }));
    const inicio = performance.now();
    (function cuadro(ahora) {
      const t = ahora - inicio;
      g.clearRect(0, 0, r.width, r.height);
      piezas.forEach((p) => {
        p.vy += 0.42; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.a += p.va;
        g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, Math.abs(Math.cos(p.a * 2)) * p.h + 1); g.restore();
      });
      if (t < 4200) requestAnimationFrame(cuadro); else g.clearRect(0, 0, r.width, r.height);
    })(inicio);
  }

  // ─────────── red: lista de acreditados ───────────
  async function pedirLista() {
    if (DEMO) return listaDemo();
    const control = new AbortController();
    const t = setTimeout(() => control.abort(), 25000);
    try {
      // text/plain: pedido "simple", igual que los celulares del staff (sin consulta previa de CORS).
      const r = await fetch(SERVICIO + '/staff', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ op: 'lista', clave }), signal: control.signal });
      return await r.json();
    } catch {
      return { ok: false, error: 'red' };
    } finally {
      clearTimeout(t);
    }
  }

  let demoCache = null;
  function listaDemo() {
    if (!demoCache) {
      const nom = ['Martina', 'Juan Ignacio', 'Lucía', 'Tomás', 'Camila', 'Agustín', 'Valentina', 'Facundo', 'Sofía', 'Mateo', 'Julieta', 'Franco', 'Milagros', 'Bautista', 'Rocío', 'Santiago', 'Florencia', 'Nicolás', 'Abril', 'Joaquín'];
      const ape = ['Fernández', 'González', 'Rodríguez', 'López', 'Martínez', 'Pérez', 'Gómez', 'Sánchez', 'Romero', 'Díaz', 'Álvarez', 'Torres', 'Ruiz', 'Benítez', 'Acosta', 'Medina', 'Herrera', 'Aguirre', 'de la Fuente', 'Villalba Echeverría'];
      const entradas = [];
      const acred = {};
      for (let i = 0; i < 160; i++) {
        const c = 'EFS26-DEMO' + String(i).padStart(4, '0');
        entradas.push([c, (nom[i % 20] + ' ' + ape[(i * 7 + Math.floor(i / 20)) % 20]).toUpperCase(), String(100 + ((i * 37) % 900)), 'activa']);
        if (i % 9 !== 0) acred[c] = Date.now();
      }
      demoCache = { ok: true, entradas, acred };
    }
    return demoCache;
  }

  async function actualizarLista(avisarSiFalla) {
    const r = await pedirLista();
    if (!r.ok) {
      if (r.error === 'clave' || r.error === 'demasiados_intentos') { salir(r.error === 'clave' ? 'La clave del staff no es válida.' : 'Demasiados intentos. Esperá unos minutos.'); return false; }
      $('#estadoLista').textContent = 'No se pudo actualizar la lista (' + (r.error || 'error') + '). Se sigue con la última que llegó: ' + personas.length + ' acreditados.';
      if (avisarSiFalla) toast('No se pudo actualizar la lista. Probá de nuevo.');
      return personas.length > 0;
    }
    const acred = r.acred || {};
    personas = (r.entradas || [])
      .filter((x) => x[3] === 'activa' && acred[x[0]])
      .map((x) => ({ c: x[0], n: nombreLindo(x[1]), d3: String(x[2] || '') }));
    pintarCuenta();
    $('#estadoLista').textContent = 'Lista actualizada ' + hhmm(new Date()) + ' · ' + personas.length + ' acreditados · ' + (personas.length - elegibles().length) + ' ya afuera (ganadores o ausentes). Se actualiza sola cada 30 s.';
    return true;
  }

  function elegibles() {
    const fuera = new Set(Object.keys(estado.ausentes));
    Object.values(estado.ganadores).forEach((g) => fuera.add(g.c));
    return personas.filter((p) => !fuera.has(p.c));
  }

  function pintarCuenta() {
    $('#cuentaParticipan').textContent = String(elegibles().length);
  }

  // ─────────── pantallas ───────────
  function mostrar(cual) {
    escenario.dataset.estado = cual;
    $('#btnResultados').textContent = cual === 'resultados' ? 'Volver al premio' : 'Ganadores';
  }

  function pintarPremio() {
    const p = premio(estado.actual);
    const foto = $('#premioFoto');
    $('.vista--premio').style.gridTemplateColumns = p.foto ? '' : '1fr';
    $('.premio__foto').hidden = !p.foto;
    if (p.foto) {
      foto.src = p.foto;
      foto.alt = p.titulo;
      foto.style.animation = 'none';
      void foto.offsetWidth; // reinicia la animación de entrada
      foto.style.animation = '';
    }
    $('#premioTitulo').textContent = p.titulo;
    $('#premioDetalle').textContent = p.detalle || '';
    $('#premioSponsor').hidden = !p.logo;
    if (p.logo) { $('#premioLogo').src = p.logo; $('#premioLogo').alt = p.sponsor; }

    const ganador = estado.ganadores[p.id];
    const btn = $('#btnSortear');
    const aviso = $('#sinParticipantes');
    aviso.hidden = true;
    if (ganador) {
      btn.textContent = 'Ganó ' + ganador.n;
      btn.disabled = true;
      aviso.hidden = false;
      aviso.replaceChildren('Ya tiene ganador. ');
      const anular = document.createElement('button');
      anular.type = 'button';
      anular.className = 'mini';
      anular.textContent = 'Anular y volver a sortear';
      anular.addEventListener('click', () => {
        if (!confirm('¿Anular el ganador de "' + p.titulo + '"? ' + ganador.n + ' vuelve a participar.')) return;
        delete estado.ganadores[p.id];
        guardar(); pintarTodo();
      });
      aviso.appendChild(anular);
    } else {
      btn.textContent = 'Sortear';
      btn.disabled = false;
    }
    pintarChips();
  }

  function pintarChips() {
    const cont = $('#chipsPremios');
    cont.replaceChildren();
    premios().forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (estado.ganadores[p.id] ? ' chip--hecho' : '');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(p.id === estado.actual && escenario.dataset.estado !== 'resultados'));
      b.textContent = p.corto || p.titulo;
      b.title = p.titulo + (estado.ganadores[p.id] ? ' · ganó ' + estado.ganadores[p.id].n : '');
      b.disabled = girando;
      b.addEventListener('click', () => {
        if (girando) return;
        estado.actual = p.id;
        estado.pendiente = null;
        guardar();
        mostrar('premio');
        pintarPremio();
      });
      cont.appendChild(b);
    });
  }

  function pintarResultados() {
    const ol = $('#listaResultados');
    ol.replaceChildren();
    premios().forEach((p) => {
      const li = document.createElement('li');
      const img = document.createElement('img');
      img.alt = '';
      if (p.foto) img.src = p.foto;
      const txt = document.createElement('div');
      const a = document.createElement('p');
      a.className = 'r-premio';
      a.textContent = p.titulo + (p.sponsor ? ' · ' + p.sponsor : '');
      const b = document.createElement('p');
      const g = estado.ganadores[p.id];
      b.className = 'r-nombre' + (g ? '' : ' r-nombre--falta');
      b.textContent = g ? g.n : 'Sin sortear';
      txt.append(a, b);
      li.append(img, txt);
      ol.appendChild(li);
    });
  }

  function pintarTodo() {
    pintarCuenta();
    if (escenario.dataset.estado === 'resultados') pintarResultados();
    else pintarPremio();
    pintarChips();
  }

  // El nombre ocupa todo el ancho de la placa, en una línea, lo más grande posible.
  function ajustarNombre() {
    const el = $('#nombreGira');
    const placa = el.parentElement;
    const ancho = placa.clientWidth - parseFloat(getComputedStyle(placa).paddingLeft) * 2;
    const alto = placa.clientHeight;
    let tam = Math.min(alto * 0.42, 260);
    el.style.whiteSpace = 'nowrap';
    el.style.fontSize = tam + 'px';
    if (el.scrollWidth > ancho) tam = Math.max(36, tam * ancho / el.scrollWidth * 0.98);
    el.style.fontSize = tam + 'px';
    if (el.scrollWidth > ancho) el.style.whiteSpace = 'normal';
  }

  // ─────────── sortear ───────────
  async function sortear() {
    if (girando) return;
    const p = premio(estado.actual);
    if (estado.ganadores[p.id]) return;
    girando = true; // desde ya: un segundo clic mientras llega la lista no arranca otro sorteo
    ctx(); // el audio tiene que arrancar dentro de un gesto del usuario
    // Justo antes de sortear se trae la lista otra vez, por si alguien se acreditó recién.
    $('#btnSortear').disabled = true;
    $('#btnSortear').textContent = 'Preparando…';
    await actualizarLista(false);
    const lista = elegibles();
    if (!lista.length) {
      girando = false;
      mostrar('premio');
      pintarPremio();
      const aviso = $('#sinParticipantes');
      aviso.textContent = personas.length ? 'No queda nadie para sortear: todos los acreditados ya ganaron o figuran como ausentes.' : 'Todavía no hay nadie acreditado.';
      aviso.hidden = false;
      return;
    }
    const ganador = lista[azar(lista.length)];
    girar(p, lista, ganador);
  }

  function girar(p, lista, ganador) {
    girando = true;
    clearTimeout(temporizador);
    $('#sorteoPremio').textContent = p.titulo;
    $('#nombreDni').textContent = '';
    mostrar('girando');
    pintarChips();
    const el = $('#nombreGira');
    const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const total = reducido ? 1200 : GIRO_MS;
    const inicio = performance.now();
    let ultimo = -1;
    const paso = () => {
      const t = performance.now() - inicio;
      const avance = Math.min(1, t / total);
      if (avance >= 1) return terminar(p, ganador);
      // Cada vez más lento: de 45 ms a ~480 ms entre nombre y nombre.
      let i;
      do { i = azar(lista.length); } while (lista.length > 1 && i === ultimo);
      ultimo = i;
      el.textContent = lista[i].n;
      ajustarNombre();
      tic(avance);
      temporizador = setTimeout(paso, 45 + Math.pow(avance, 2.6) * 440);
    };
    paso();
  }

  function terminar(p, ganador) {
    const el = $('#nombreGira');
    el.textContent = ganador.n;
    $('#nombreDni').textContent = ganador.d3 ? 'DNI terminado en ' + ganador.d3 : '';
    estado.pendiente = { premio: p.id, persona: ganador };
    guardar();
    mostrar('ganador');
    ajustarNombre();
    girando = false;
    pintarChips();
    campanita();
    papelitos();
  }

  function confirmar() {
    const pend = estado.pendiente;
    if (!pend) return;
    estado.ganadores[pend.premio] = pend.persona;
    estado.pendiente = null;
    const siguiente = premios().find((x) => !estado.ganadores[x.id]);
    guardar();
    pintarCuenta();
    if (siguiente) {
      estado.actual = siguiente.id;
      guardar();
      mostrar('premio');
      pintarPremio();
    } else {
      mostrar('resultados');
      pintarResultados();
      pintarChips();
      campanita();
      papelitos();
    }
  }

  function ausente() {
    const pend = estado.pendiente;
    if (!pend) return;
    estado.ausentes[pend.persona.c] = pend.persona;
    estado.pendiente = null;
    guardar();
    pintarCuenta();
    // Se queda en la placa: el nombre se borra y enseguida vuelve a girar.
    $('#nombreGira').textContent = '';
    $('#nombreDni').textContent = '';
    mostrar('girando');
    sortear();
  }

  // ─────────── botones ───────────
  $('#btnSortear').addEventListener('click', sortear);
  $('#btnConfirmar').addEventListener('click', confirmar);
  $('#btnAusente').addEventListener('click', ausente);

  function alternarResultados() {
    if (girando) return;
    if (escenario.dataset.estado === 'resultados') { mostrar('premio'); pintarPremio(); return; }
    if (escenario.dataset.estado === 'ganador') return; // primero confirmar o descartar
    mostrar('resultados');
    pintarResultados();
    pintarChips();
  }
  $('#btnResultados').addEventListener('click', alternarResultados);

  $('#btnActualizar').addEventListener('click', async () => {
    const b = $('#btnActualizar');
    b.disabled = true;
    if (await actualizarLista(true)) toast('Lista actualizada: ' + personas.length + ' acreditados.');
    b.disabled = false;
  });

  function pintarSonido() {
    const b = $('#btnSonido');
    b.textContent = 'Sonido: ' + (estado.sonido ? 'sí' : 'no');
    b.setAttribute('aria-pressed', String(estado.sonido));
  }
  function alternarSonido() { estado.sonido = !estado.sonido; guardar(); pintarSonido(); }
  $('#btnSonido').addEventListener('click', alternarSonido);

  function pantallaCompleta() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => toast('El navegador no dejó pasar a pantalla completa (probá F11).'));
  }
  $('#btnPantalla').addEventListener('click', pantallaCompleta);
  document.addEventListener('fullscreenchange', () => {
    $('#btnPantalla').textContent = document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa';
    if (escenario.dataset.estado !== 'premio') ajustarNombre();
  });

  $('#btnMas').addEventListener('click', () => { $('#panelMas').hidden = !$('#panelMas').hidden; });

  $('#formPremio').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const titulo = $('#nuevoPremio').value.trim().slice(0, 80);
    if (!titulo) return;
    const p = { id: 'extra-' + Date.now().toString(36), corto: titulo, titulo, detalle: '', foto: '', logo: '', sponsor: '' };
    estado.extras.push(p);
    estado.actual = p.id;
    guardar();
    $('#nuevoPremio').value = '';
    mostrar('premio');
    pintarPremio();
    toast('Premio agregado.');
  });

  $('#btnCopiar').addEventListener('click', async () => {
    const texto = premios().map((p) => p.titulo + (p.sponsor ? ' (' + p.sponsor + ')' : '') + ': ' + (estado.ganadores[p.id] ? estado.ganadores[p.id].n + ' · DNI terminado en ' + estado.ganadores[p.id].d3 + ' · ' + estado.ganadores[p.id].c : 'sin sortear')).join('\n');
    try { await navigator.clipboard.writeText(texto); toast('Ganadores copiados.'); } catch { prompt('Copiá los ganadores:', texto); }
  });

  $('#btnAusentes').addEventListener('click', () => {
    const cont = $('#listaAusentes');
    cont.hidden = !cont.hidden;
    if (cont.hidden) return;
    cont.replaceChildren();
    const lista = Object.values(estado.ausentes);
    if (!lista.length) { cont.textContent = 'Nadie marcado como ausente.'; return; }
    cont.append('Ausentes (no vuelven a salir): ');
    lista.forEach((a) => {
      const s = document.createElement('span');
      s.textContent = a.n;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mini';
      b.textContent = 'Vuelve a participar';
      b.addEventListener('click', () => { delete estado.ausentes[a.c]; guardar(); pintarCuenta(); s.remove(); b.remove(); });
      cont.append(s, b, ' ');
    });
  });

  $('#btnReiniciar').addEventListener('click', () => {
    if (!confirm('¿Borrar todos los ganadores, ausentes y premios agregados? No se puede deshacer.')) return;
    const sonido = estado.sonido;
    estado = { extras: [], ganadores: {}, ausentes: {}, actual: PREMIOS_BASE[0].id, sonido };
    guardar();
    mostrar('premio');
    pintarTodo();
    toast('Sorteo reiniciado.');
  });

  $('#btnSalir').addEventListener('click', () => salir(''));

  // Atajos de teclado (también sirven para un control de presentaciones: flecha derecha / AvPág).
  document.addEventListener('keydown', (ev) => {
    if (ev.target.closest('input, textarea') || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if ($('#app').hidden) return;
    const k = ev.key;
    if (k === ' ' || k === 'Enter' || k === 'ArrowRight' || k === 'PageDown') {
      ev.preventDefault();
      if (escenario.dataset.estado === 'premio') sortear();
      else if (escenario.dataset.estado === 'ganador') confirmar();
    } else if (k === 'r' || k === 'R') alternarResultados();
    else if (k === 'f' || k === 'F') pantallaCompleta();
    else if (k === 'm' || k === 'M') alternarSonido();
    else if (k === 'Escape' && escenario.dataset.estado === 'resultados') alternarResultados();
  });
  // Que un clic no deje el foco en un botón: si no, la barra espaciadora lo volvería a apretar.
  document.addEventListener('click', (ev) => { const b = ev.target.closest('#app button'); if (b) b.blur(); });

  window.addEventListener('resize', () => { if (escenario.dataset.estado !== 'premio') ajustarNombre(); });

  // ─────────── ingreso ───────────
  function salir(mensaje) {
    clave = '';
    try { sessionStorage.removeItem(SESION_CLAVE); } catch { /* nada */ }
    clearInterval(salir.intervalo);
    $('#app').hidden = true;
    $('#ingreso').hidden = false;
    const err = $('#errorIngreso');
    err.textContent = mensaje || '';
    err.hidden = !mensaje;
  }

  async function entrar() {
    const ok = await actualizarLista(false);
    if (!ok) return false;
    $('#ingreso').hidden = true;
    $('#app').hidden = false;
    $('#demoAviso').hidden = !DEMO;
    pintarSonido();
    // Si se recargó con un ganador en pantalla sin confirmar, se vuelve a mostrar.
    if (estado.pendiente && !estado.ganadores[estado.pendiente.premio]) {
      const p = premio(estado.pendiente.premio);
      estado.actual = p.id;
      $('#sorteoPremio').textContent = p.titulo;
      $('#nombreGira').textContent = estado.pendiente.persona.n;
      $('#nombreDni').textContent = estado.pendiente.persona.d3 ? 'DNI terminado en ' + estado.pendiente.persona.d3 : '';
      mostrar('ganador');
      ajustarNombre();
    } else {
      estado.pendiente = null;
      mostrar('premio');
    }
    pintarTodo();
    clearInterval(salir.intervalo);
    salir.intervalo = setInterval(() => { if (!girando) actualizarLista(false); }, REFRESCO_MS);
    return true;
  }

  $('#formIngreso').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = $('#btnEntrar');
    clave = $('#clave').value.trim();
    if (!clave) return;
    btn.disabled = true;
    btn.textContent = 'Entrando… (puede tardar unos segundos)';
    $('#errorIngreso').hidden = true;
    const ok = await entrar();
    btn.disabled = false;
    btn.textContent = 'Entrar';
    if (ok) {
      try { sessionStorage.setItem(SESION_CLAVE, clave); } catch { /* nada */ }
      $('#clave').value = '';
    } else if ($('#errorIngreso').hidden) {
      $('#errorIngreso').textContent = 'No hay conexión con el servidor. Probá de nuevo.';
      $('#errorIngreso').hidden = false;
    }
  });

  async function cargarServicio() {
    const forzado = new URLSearchParams(location.search).get('servicio');
    if (forzado) { SERVICIO = forzado.replace(/\/$/, ''); return; }
    try {
      const ev = await (await fetch('../../assets/data/evento.json', { cache: 'no-store' })).json();
      SERVICIO = String((ev.inscripcion && ev.inscripcion.servicio) || '').replace(/\/$/, '');
    } catch { SERVICIO = ''; }
  }

  (async () => {
    await cargarServicio();
    if (DEMO) { await entrar(); return; }
    try { clave = sessionStorage.getItem(SESION_CLAVE) || ''; } catch { clave = ''; }
    if (clave) await entrar();
  })();
})();
