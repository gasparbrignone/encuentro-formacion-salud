/* Panel de inscripciones del EFS (Etapa 1: ver y reenviar). Habla con dos cosas:
   - El Apps Script de ATP (login: misma contraseña + TOTP que /staff/panel/ de ATP), por JSONP,
     porque un Web App de Apps Script no manda cabeceras CORS.
   - El Worker del EFS (acciones admin_*), por fetch normal con el token de esa sesión: el Worker
     ya tiene CORS para efsarg.com.ar y reenvía al mismo Apps Script con el secreto compartido.
   No se cambió nada del backend para esta etapa: admin_resumen, admin_buscar y admin_reenviar
   ya existían y ya se usan en producción (el escáner y las campañas de mail los usan hace rato). */
(() => {
  'use strict';

  const GOOGLE_FORMS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzIYU4H3B94IoTyH40O4EXljqPVTNGd0Ult_yi8VzS3hhAOjScEdsCQlNZarE5Ixe6f/exec';
  const SESSION_KEY = 'efs-admin-token';

  let SERVICIO = '';
  let token = '';

  const $ = (sel) => document.querySelector(sel);

  // ─────────── JSONP (solo para el login, igual que /staff/panel/ de ATP) ───────────
  function jsonpRequest(endpoint, params, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const callbackName = 'efsJsonp_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
      const script = document.createElement('script');
      const limpiar = () => { delete window[callbackName]; script.remove(); clearTimeout(timeoutId); };
      const timeoutId = setTimeout(() => { limpiar(); reject(new Error('timeout')); }, timeoutMs);
      window[callbackName] = (respuesta) => { limpiar(); resolve(respuesta); };
      const url = new URL(endpoint);
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
      url.searchParams.set('callback', callbackName);
      script.src = url.toString();
      script.onerror = () => { limpiar(); reject(new Error('red')); };
      document.body.appendChild(script);
    });
  }

  // ─────────── acciones admin_* contra el Worker del EFS ───────────
  async function api(accion, datos = {}, timeoutMs = 15000) {
    const control = new AbortController();
    const t = setTimeout(() => control.abort(), timeoutMs);
    try {
      const r = await fetch(SERVICIO + '/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion, token, ...datos }),
        signal: control.signal,
      });
      return await r.json();
    } catch (err) {
      return { ok: false, error: 'red' };
    } finally {
      clearTimeout(t);
    }
  }

  function getToken() {
    return sessionStorage.getItem(SESSION_KEY) || '';
  }

  function sesionVencida() {
    sessionStorage.removeItem(SESSION_KEY);
    token = '';
    $('#app').hidden = true;
    $('#ingreso').hidden = false;
    avisar('Tu sesión venció — iniciá sesión de nuevo.', 'error');
  }

  function avisar(texto, tipo) {
    const el = $('#avisoGlobal');
    if (!texto) { el.hidden = true; return; }
    el.textContent = texto;
    el.dataset.tipo = tipo || '';
    el.hidden = false;
  }

  // ─────────── login ───────────
  $('#formIngreso').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = $('#btnEntrar');
    const password = $('#clave').value;
    const code = $('#codigo').value;
    const errorEl = $('#errorIngreso');
    errorEl.hidden = true;
    if (!password || !/^\d{6}$/.test(code)) {
      errorEl.textContent = 'Completá la contraseña y el código de 6 dígitos.';
      errorEl.hidden = false;
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    try {
      const loginId = crypto.randomUUID();
      const envio = new AbortController();
      const envioTimeout = setTimeout(() => envio.abort(), 15000);
      try {
        await fetch(GOOGLE_FORMS_ENDPOINT, {
          method: 'POST',
          mode: 'no-cors',
          body: new URLSearchParams({ action: 'adminLoginAttempt', password, code, loginId }),
          signal: envio.signal,
        });
      } finally {
        clearTimeout(envioTimeout);
      }
      btn.textContent = 'Verificando… (puede tardar hasta 30s)';
      const resp = await jsonpRequest(GOOGLE_FORMS_ENDPOINT, { action: 'adminLoginPoll', loginId }, 30000);
      if (resp.result === 'success' && resp.token) {
        sessionStorage.setItem(SESSION_KEY, resp.token);
        $('#codigo').value = '';
        $('#clave').value = '';
        await entrar(resp.token);
      } else {
        errorEl.textContent = 'Contraseña o código incorrectos.';
        errorEl.hidden = false;
      }
    } catch (err) {
      if (err && (err.name === 'AbortError' || err.message === 'timeout')) {
        errorEl.textContent = 'Tardó demasiado en responder (Apps Script está lento) — probá de nuevo en unos segundos.';
      } else {
        errorEl.textContent = 'No pudimos conectar. Probá de nuevo en un rato.';
      }
      errorEl.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  });

  $('#btnSalir').addEventListener('click', () => {
    const t = getToken();
    sessionStorage.removeItem(SESSION_KEY);
    if (t) jsonpRequest(GOOGLE_FORMS_ENDPOINT, { action: 'adminLogout', token: t }).catch(() => {});
    token = '';
    $('#app').hidden = true;
    $('#ingreso').hidden = false;
  });

  $('#btnRecargar').addEventListener('click', () => cargarResumen());

  // ─────────── resumen + tabla de entradas ───────────
  let entradasCache = [];

  // Se ve completo solo al buscar a alguien puntual (Buscar pago); acá, de un
  // vistazo, mejor no mostrar el padrón entero con los datos a la vista.
  function enmascararDni(dni) {
    const d = String(dni || '');
    if (d.length <= 4) return d;
    return d.slice(0, 2) + '*'.repeat(d.length - 4) + d.slice(-2);
  }
  function enmascararMail(correo) {
    const m = String(correo || '');
    const arroba = m.indexOf('@');
    if (arroba < 1) return m;
    const usuario = m.slice(0, arroba);
    const resto = usuario.length <= 2 ? usuario : usuario.slice(0, 2) + '*'.repeat(usuario.length - 2);
    return resto + m.slice(arroba);
  }

  function renderResumen(data) {
    const chips = $('#resumenEstados');
    chips.innerHTML = '';
    const estados = data.pendientes || {};
    const total = Object.values(estados).reduce((a, b) => a + b, 0);
    const haceChip = (texto) => {
      const c = document.createElement('span');
      c.className = 'chip';
      c.textContent = texto;
      chips.appendChild(c);
    };
    haceChip('Entradas emitidas: ' + (data.entradas ? data.entradas.length : 0));
    haceChip('Intentos en Pendientes: ' + total);
    Object.entries(estados).forEach(([estado, cant]) => haceChip((estado || 'sin estado') + ': ' + cant));

    entradasCache = data.entradas || [];
    renderTablaEntradas(entradasCache);
  }

  function renderTablaEntradas(lista) {
    const cuerpo = $('#cuerpoEntradas');
    cuerpo.innerHTML = '';
    if (!lista.length) {
      const fila = document.createElement('tr');
      const celda = document.createElement('td');
      celda.colSpan = 7;
      celda.textContent = 'Sin resultados.';
      fila.appendChild(celda);
      cuerpo.appendChild(fila);
      return;
    }
    lista.forEach((e) => {
      const fila = document.createElement('tr');

      const nombre = document.createElement('td');
      nombre.className = 'col-nombre';
      nombre.textContent = (e.nombre || '') + ' ' + (e.apellido || '');
      fila.appendChild(nombre);

      const dni = document.createElement('td');
      dni.textContent = enmascararDni(e.dni);
      fila.appendChild(dni);

      const mail = document.createElement('td');
      mail.className = 'col-mail';
      mail.textContent = enmascararMail(e.correo);
      fila.appendChild(mail);

      const origen = document.createElement('td');
      origen.textContent = e.origen || '';
      fila.appendChild(origen);

      const estado = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = 'estado';
      badge.dataset.e = e.estado || '';
      badge.textContent = e.estado || '';
      estado.appendChild(badge);
      fila.appendChild(estado);

      const mailEntrada = document.createElement('td');
      mailEntrada.textContent = e.mail || '(nunca)';
      fila.appendChild(mailEntrada);

      const accion = document.createElement('td');
      const btn = document.createElement('button');
      btn.className = 'btn btn-mini';
      btn.type = 'button';
      btn.textContent = 'Reenviar';
      btn.addEventListener('click', () => reenviar(e.codigo, btn, mailEntrada));
      accion.appendChild(btn);
      fila.appendChild(accion);

      cuerpo.appendChild(fila);
    });
  }

  async function reenviar(codigo, btn, celdaMail) {
    if (!codigo) return;
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    const r = await api('admin_reenviar', { codigo });
    if (r.ok) {
      btn.textContent = 'Reenviado';
      avisar('Entrada reenviada (' + codigo + ').', 'ok');
      // La fecha real queda en la hoja; acá solo reflejamos que se intentó.
      celdaMail.textContent = 'reenviado ahora';
    } else if (r.error === 'no_autorizado') {
      sesionVencida();
    } else {
      btn.disabled = false;
      btn.textContent = 'Reenviar';
      avisar('No se pudo reenviar ' + codigo + ' — revisá la columna MailEntrada en la planilla.', 'error');
    }
  }

  $('#filtroEntradas').addEventListener('input', (ev) => {
    const q = ev.target.value.trim().toLowerCase();
    if (!q) return renderTablaEntradas(entradasCache);
    const filtradas = entradasCache.filter((e) => {
      return [e.nombre, e.apellido, e.dni, e.correo, e.codigo].some((v) => String(v || '').toLowerCase().includes(q));
    });
    renderTablaEntradas(filtradas);
  });

  async function cargarResumen() {
    const r = await api('admin_resumen');
    if (r.ok) return renderResumen(r);
    if (r.error === 'no_autorizado') return sesionVencida();
    avisar('No se pudo cargar el resumen. Probá "Recargar".', 'error');
  }

  // ─────────── buscar pago (Pendientes + Mercado Pago) ───────────
  $('#formBuscar').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const q = $('#qBuscar').value.trim();
    const cont = $('#resultadosBuscar');
    cont.innerHTML = '';
    if (q.length < 4) {
      avisar('Escribí al menos 4 caracteres del DNI o el mail.', 'error');
      return;
    }
    avisar('');
    const r = await api('admin_buscar', { q });
    if (r.error === 'no_autorizado') return sesionVencida();
    if (!r.ok) {
      cont.textContent = 'No se pudo buscar.';
      return;
    }
    if (!r.resultados.length) {
      cont.textContent = 'Nadie con ese DNI o mail en inscripciones pendientes.';
      return;
    }
    r.resultados.forEach((res) => {
      const div = document.createElement('div');
      div.className = 'resultado-pago';

      const h3 = document.createElement('h3');
      h3.textContent = res.nombre + ' — DNI ' + res.dni + ' — ' + res.correo;
      div.appendChild(h3);

      const estado = document.createElement('p');
      estado.textContent = 'Estado: ' + res.estado + (res.motivo ? ' (' + res.motivo + ')' : '') + ' · Entrada: ' + (res.entrada || '(ninguna)');
      div.appendChild(estado);

      const pagos = document.createElement('p');
      pagos.className = 'pagos';
      pagos.textContent = res.pagos.length
        ? res.pagos.map((p) => (p.error || (p.status + '/' + p.detalle + ' $' + p.monto + ' ' + p.fecha))).join(' · ')
        : 'Sin pagos encontrados en Mercado Pago.';
      div.appendChild(pagos);

      cont.appendChild(div);
    });
  });

  // ─────────── alta de transferencia (Etapa 2) ───────────
  const CAMPOS_TRANSFERENCIA = ['nombre', 'apellido', 'dni', 'correo', 'telefono', 'carrera', 'anio', 'universidad', 'monto', 'fecha', 'comprobante'];
  const OBLIGATORIOS_TRANSFERENCIA = ['nombre', 'apellido', 'dni', 'correo', 'telefono', 'carrera', 'anio', 'universidad'];
  let transferenciaPendiente = null;

  $('#formTransferencia').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const datos = {};
    CAMPOS_TRANSFERENCIA.forEach((k) => { datos[k] = $('#t_' + k).value.trim(); });
    const errorEl = $('#errorTransferencia');
    const faltante = OBLIGATORIOS_TRANSFERENCIA.find((k) => !datos[k]);
    if (faltante) {
      errorEl.textContent = 'Completá todos los campos obligatorios.';
      errorEl.hidden = false;
      return;
    }
    errorEl.hidden = true;
    transferenciaPendiente = datos;
    const resumen = $('#previaTransferenciaTexto');
    resumen.innerHTML = '';
    const p1 = document.createElement('p');
    p1.innerHTML = '<strong>' + datos.nombre + ' ' + datos.apellido + '</strong> — DNI ' + datos.dni + ' — ' + datos.correo + ' — ' + datos.telefono;
    resumen.appendChild(p1);
    const p2 = document.createElement('p');
    p2.textContent = datos.carrera + ', ' + datos.anio + '° año, ' + datos.universidad;
    resumen.appendChild(p2);
    const detalle = [datos.monto && ('$' + datos.monto), datos.fecha, datos.comprobante].filter(Boolean).join(' · ');
    if (detalle) {
      const p3 = document.createElement('p');
      p3.textContent = 'Transferencia: ' + detalle;
      resumen.appendChild(p3);
    }
    $('#formTransferencia').hidden = true;
    $('#previaTransferencia').hidden = false;
  });

  function cerrarPreviaTransferencia() {
    transferenciaPendiente = null;
    $('#previaTransferencia').hidden = true;
    $('#formTransferencia').hidden = false;
  }

  $('#btnEditarTransferencia').addEventListener('click', cerrarPreviaTransferencia);

  $('#btnConfirmarTransferencia').addEventListener('click', async () => {
    if (!transferenciaPendiente) return;
    const btn = $('#btnConfirmarTransferencia');
    btn.disabled = true;
    btn.textContent = 'Emitiendo…';
    const r = await api('admin_alta_transferencia', transferenciaPendiente);
    btn.disabled = false;
    btn.textContent = 'Confirmar y emitir';
    if (r.ok) {
      avisar('Entrada emitida y mail enviado (' + r.codigo + ').', 'ok');
      $('#formTransferencia').reset();
      cerrarPreviaTransferencia();
      cargarResumen();
      return;
    }
    if (r.error === 'no_autorizado') return sesionVencida();
    const mensajes = {
      datos: 'Revisá el campo "' + (r.campo || '') + '".',
      ya_inscripto: 'Ese DNI ya tiene una entrada activa (' + (r.entrada || '') + ').',
      ocupado: 'El sistema está ocupado, probá de nuevo en unos segundos.',
      red: 'No pudimos conectar. Probá de nuevo.',
    };
    avisar(mensajes[r.error] || 'No se pudo emitir la entrada.', 'error');
  });

  // ─────────── arranque ───────────
  async function entrar(t) {
    token = t;
    $('#ingreso').hidden = true;
    $('#app').hidden = false;
    await cargarResumen();
  }

  async function cargarServicio() {
    const forzado = new URLSearchParams(location.search).get('servicio');
    if (forzado) { SERVICIO = forzado.replace(/\/$/, ''); return; }
    try {
      const ev = await (await fetch('../assets/data/evento.json', { cache: 'no-store' })).json();
      SERVICIO = String((ev.inscripcion && ev.inscripcion.servicio) || '').replace(/\/$/, '');
    } catch (err) {
      SERVICIO = '';
    }
  }

  (async () => {
    await cargarServicio();
    const t = getToken();
    if (t) await entrar(t);
  })();
})();
