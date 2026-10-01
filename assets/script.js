/* EFS · sitio
   Todo el contenido editable vive en assets/data/*.json y se edita desde Pages CMS (ver INSTRUCTIVO.md).
   - evento.json       fecha, edición, lugar, estado de la inscripción, contacto
   - actividades.json  programa: charlas, talleres, disertantes, fotos
   - archivo/*.json    ediciones anteriores
   Vista previa con contenido de ejemplo: agregar ?demo a la dirección (usa el programa de la 1.ª edición).
*/
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const DEMO = new URLSearchParams(location.search).has('demo');
  const TINTA = { charla: '#2C6FA0', taller: '#1C7A72', info: '#2C6FA0' };

  // ── utilidades
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60);
  const categoria = (tipo) => {
    const t = String(tipo || '').toLowerCase();
    if (t === 'especial') return 'info';
    if (t.startsWith('charla')) return 'charla';
    if (t.includes('taller') || t.includes('capacit')) return 'taller';
    return 'charla';
  };
  const horario = (a) => (a.inicio ? (a.fin ? `${a.inicio} a ${a.fin}` : a.inicio) : '');
  const cargar = (url) => fetch(url, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  // ── menú
  const burger = $('#burger'), links = $('#navLinks');
  burger.addEventListener('click', () => {
    const abierto = links.classList.toggle('abierto');
    burger.setAttribute('aria-expanded', String(abierto));
  });
  links.addEventListener('click', (e) => {
    if (e.target.closest('a')) { links.classList.remove('abierto'); burger.setAttribute('aria-expanded', 'false'); }
  });
  window.addEventListener('scroll', () => $('#nav').classList.toggle('nav--sombra', window.scrollY > 8), { passive: true });

  // ── evento
  function aplicarEvento(ev) {
    if (!ev) return;
    document.querySelectorAll('[data-evento]').forEach((n) => {
      const k = n.dataset.evento;
      if (k === 'cta') return;
      if (ev[k]) n.textContent = ev[k];
    });
    const fecha = $('.dato-fecha');
    if (fecha && ev.horario && ev.fecha && !/pr[oó]ximamente/i.test(ev.fecha)) fecha.textContent = `${ev.fecha}, ${ev.horario}`;
    if (ev.direccion) $('#mapaLink').href = 'https://maps.google.com/?q=' + encodeURIComponent(`${ev.lugar || ''} ${ev.direccion}`);
    const c = ev.contacto || {};
    if (c.email) { const m = $('[data-contacto="email"]'); m.href = 'mailto:' + c.email; m.textContent = c.email; }
    inscripcion(ev.inscripcion || {}, c);
  }

  const pesos = (n) => '$' + Number(n).toLocaleString('es-AR');

  // Precio en el inicio: "Inscripción: $5.000", "Entrada libre y gratuita" (precio 0) o nada si no está definido.
  function precioInicio(i) {
    const tema = $('[data-tema="precio"]');
    if (!tema) return;
    if (i.precio === 0 || i.precio === '0') tema.textContent = 'Entrada libre y gratuita';
    else if (Number(i.precio) > 0) tema.textContent = 'Inscripción: ' + pesos(i.precio);
    tema.hidden = !tema.textContent;
    // Kit de bienvenida: el texto repite el precio de la inscripción. Sin precio se deja el texto genérico; entrada gratuita: no se promete kit.
    const kit = $('#kit'), lead = $('#kitLead');
    if (kit && lead) {
      if (i.precio === 0 || i.precio === '0') kit.hidden = true;
      else if (Number(i.precio) > 0) lead.innerHTML = `Tu inscripción de <b>${pesos(i.precio)}</b> incluye la entrada al EFS y el kit de bienvenida.`;
    }
  }

  // Con "apertura" y "cierre" (fechas con hora, ej. 2026-10-02T00:00:00-03:00) el sitio abre y cierra
  // solo. La que manda de verdad es la planilla: fuera de fecha rechaza igual la inscripción.
  function etiquetarCta(texto) {
    document.querySelectorAll('.btn[href="#inscripcion"]').forEach((b) => { b.textContent = texto; });
  }
  function estadoPorFecha(i) {
    if (i.estado !== 'abierta') return i;
    const ahora = Date.now();
    const desde = i.apertura ? Date.parse(i.apertura) : NaN;
    const hasta = i.cierre ? Date.parse(i.cierre) : NaN;
    if (desde > ahora) return { ...i, estado: 'proximamente' };
    if (hasta < ahora) return { ...i, estado: 'cerrada' };
    return i;
  }

  function inscripcion(i, contacto = {}) {
    i = estadoPorFecha(i);
    const cont = $('#inscripcionCont');
    const cta = $('[data-evento="cta"]');
    precioInicio(i);
    const conPago = i.modo === 'mercadopago' && i.servicio;
    const volviendoDelPago = new URLSearchParams(location.search).has('pago');

    // Quien vuelve de Mercado Pago ve su entrada aunque la inscripción ya figure
    // como cerrada o todavía como "próximamente" (por ejemplo, si pagó justo al cierre).
    if (conPago && volviendoDelPago && i.estado !== 'abierta') {
      cont.innerHTML = formularioPago(i, contacto);
      $('#inscForm').hidden = true;
      retornoPago(i, false);
      return;
    }

    if (i.estado === 'abierta' && conPago) {
      cont.innerHTML = formularioPago(i, contacto);
      cta.textContent = 'Inscribite'; cta.href = '#inscripcion';
      $('#formInsc').addEventListener('submit', (e) => enviarInscripcion(e, i));
      prepararConfirmacion(i);
      cargarTurnstile(i);
      retornoPago(i);
      medirVistaInscripcion();
    } else if (i.estado === 'abierta' && i.link) {
      const gratis = !(Number(i.precio) > 0);
      cont.innerHTML = `
        <p class="insc-estado">Inscripción abierta</p>
        <p class="insc-texto">${esc(i.texto || (gratis ? 'Es gratis y lleva dos minutos.' : `La inscripción cuesta ${pesos(i.precio)} y lleva dos minutos.`))}</p>
        <ol class="pasos">
          <li><span>01</span><b>Ingresá</b> al formulario de inscripción</li>
          <li><span>02</span><b>Completá tus datos</b> nombre, correo y carrera</li>
          <li><span>03</span><b>Confirmá</b> te llega un correo con tu inscripción</li>
        </ol>
        <a class="btn btn--blanco" href="${esc(i.link)}" target="_blank" rel="noopener">Inscribite</a>`;
      cta.textContent = 'Inscribite'; cta.href = i.link; cta.target = '_blank'; cta.rel = 'noopener';
    } else if (i.estado === 'cerrada') {
      etiquetarCta('Ver inscripción');
      cont.innerHTML = `<p class="insc-estado">Inscripción cerrada</p><p class="insc-texto">${esc(i.texto || 'Ya cerramos la inscripción para esta edición. Si tenés dudas, escribinos por mail.')}</p>`;
    } else {
      // todavía no abrió: el botón no promete una inscripción que no existe, lleva a ver cuándo abre
      etiquetarCta('Cuándo abre la inscripción');
      if (i.texto) $('.insc-texto', cont).textContent = i.texto;
    }
  }

  // Formulario con pago por Mercado Pago. Habla con el Worker del EFS
  // (i.servicio = su dirección), que verifica Turnstile y pasa el pedido al
  // Apps Script de ATP. Ver docs/EFS_2026_PLAN.md en el repo de la plataforma.
  const INTENTO = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(16).slice(2);
  let turnstileId = null;
  let turnstileToken = '';

  const ERRORES = {
    turnstile: 'No pudimos comprobar que no sos un robot. Recargá la página y probá de nuevo.',
    demasiados_intentos: 'Hiciste varios intentos seguidos. Esperá unos minutos y volvé a probar.',
    ya_inscripto: 'Ya hay una inscripción paga con ese DNI. Tu entrada está en el mail que te mandamos (revisá también spam). Si no la encontrás, escribinos por mail.',
    cerrada: 'La inscripción está cerrada.',
    correo_dominio: 'Ese correo no parece existir: revisá lo que está después de la @.',
  };
  const CAMPOS = { nombre: 'el nombre', apellido: 'el apellido', dni: 'el DNI', telefono: 'el teléfono', correo: 'el correo', carrera: 'la carrera', anio: 'el año', universidad: 'la universidad' };

  function formularioPago(i, contacto = {}) {
    const precio = Number(i.precio) > 0 ? pesos(i.precio) : '';
    const email = String(contacto.email || '').trim();
    const anios = ['1.º', '2.º', '3.º', '4.º', '5.º', '6.º', 'Internado / PFO', 'Egresado/a', 'Otro'];
    const carreras = ['Medicina', 'Enfermería', 'Fonoaudiología', 'Obstetricia', 'Psicología', 'Nutrición', 'Kinesiología', 'Odontología', 'Bioquímica'];
    return `
      <div id="inscMensaje" class="insc-mensaje" hidden role="status" aria-live="polite"></div>
      <div id="inscForm">
        <p class="insc-estado">Inscripción abierta</p>
        <p class="insc-texto">${esc(i.texto || `Completá tus datos y pagá la inscripción${precio ? ` (${precio})` : ''} con Mercado Pago. Apenas se aprueba el pago ves tu entrada en pantalla y te llega por mail.`)}</p>
        <ol class="pasos pasos--cortos">
          <li><span>01</span><b>Completá tus datos</b></li>
          <li><span>02</span><b>Pagá con Mercado Pago</b> débito, crédito o dinero en cuenta</li>
          <li><span>03</span><b>Recibí tu entrada</b> un código QR personal</li>
        </ol>
        <form class="form" id="formInsc" novalidate>
          <p class="form-aviso">Completá tu nombre, apellido, DNI y correo tal como querés que figuren en tu <b>certificado</b>.</p>
          <div class="form-grilla">
            <label>Nombre<input name="nombre" autocomplete="given-name" required maxlength="60"></label>
            <label>Apellido<input name="apellido" autocomplete="family-name" required maxlength="60"></label>
            <label>DNI<input name="dni" inputmode="numeric" required pattern="[0-9.\\s]{7,11}" maxlength="11" placeholder="Solo números"></label>
            <label>Teléfono<input name="telefono" type="tel" autocomplete="tel" required minlength="8" maxlength="30" placeholder="Ej.: 341 555-1234"></label>
            <label>Correo electrónico<input name="correo" type="email" autocomplete="email" required maxlength="120"></label>
            <label>Repetí el correo<input name="correo2" type="email" autocomplete="off" required maxlength="120"></label>
            <label>Carrera<input name="carrera" list="carreras" required maxlength="80"><datalist id="carreras">${carreras.map((c) => `<option value="${c}">`).join('')}</datalist></label>
            <label>Año que cursás<select name="anio" required><option value="">Elegí</option>${anios.map((a) => `<option>${a}</option>`).join('')}</select></label>
            <label class="form-ancho">Universidad<input name="universidad" required maxlength="100" value="Universidad Nacional de Rosario"></label>
          </div>
          <div id="turnstile" class="form-turnstile"></div>
          <p class="form-error" id="formError" role="alert"></p>
          <button class="btn btn--blanco" type="submit" id="formBoton">Continuar</button>
          <div class="confirmar" id="formConfirmar" hidden>
            <p class="confirmar-titulo" tabindex="-1">Revisá tus datos</p>
            <p class="confirmar-texto">Así van a figurar en tu certificado, y a este correo te llega la entrada.</p>
            <dl class="confirmar-datos" id="confirmarDatos"></dl>
            <label class="confirmar-check"><input type="checkbox" id="confirmoDatos"> <span>Revisé mi nombre, DNI y correo: están bien escritos.</span></label>
            <div class="confirmar-acciones">
              <button class="btn btn--blanco" type="button" id="botonPagar" disabled>Ir al pago${precio ? `: ${precio}` : ''}</button>
              <button class="btn-chico" type="button" id="botonCorregir">Corregir datos</button>
            </div>
          </div>
          <p class="form-pie">El costo de la inscripción cubre los materiales de los talleres y la logística del encuentro. ATP es una agrupación estudiantil y el EFS no tiene fines de lucro.</p>
          ${email ? `<a class="btn-chico" href="mailto:${email}?subject=${encodeURIComponent('EFS 2026: no puedo pagar la inscripción')}">¿No podés pagar la inscripción? Escribinos</a>` : ''}
        </form>
      </div>`;
  }

  function cargarTurnstile(i) {
    if (!i.turnstile) return;
    window.efsTurnstileListo = () => {
      turnstileId = window.turnstile.render('#turnstile', {
        sitekey: i.turnstile, theme: 'light', language: 'es',
        callback: (t) => { turnstileToken = t; },
        'expired-callback': () => { turnstileToken = ''; },
        'error-callback': () => { turnstileToken = ''; },
      });
    };
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=efsTurnstileListo';
    s.async = true; s.defer = true;
    document.head.appendChild(s);
  }

  // Meta Pixel: nunca debe romper la página si está bloqueado.
  function pixel(evento, datos, opciones) {
    try { if (window.fbq) window.fbq('track', evento, datos || {}, opciones || {}); } catch (x) { /* bloqueado */ }
  }

  // ViewContent: una vez, cuando la sección de inscripción entra en pantalla.
  function medirVistaInscripcion() {
    const sec = $('#inscripcion');
    if (!sec || !('IntersectionObserver' in window)) return;
    const o = new IntersectionObserver((es) => {
      if (es.some((x) => x.isIntersecting)) { pixel('ViewContent', { content_name: 'Inscripción EFS 2026' }); o.disconnect(); }
    }, { threshold: 0.25 });
    o.observe(sec);
  }

  async function llamar(i, ruta, cuerpo) {
    const r = await fetch(String(i.servicio).replace(/\/$/, '') + ruta, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
    });
    return r.json();
  }

  // Paso 1: validar y mostrar los datos para que la persona los confirme
  // (el certificado se emite tal cual se escribieron).
  function enviarInscripcion(e, i) {
    e.preventDefault();
    const f = e.target, err = $('#formError');
    err.textContent = '';
    f.telefono.setCustomValidity(f.telefono.value.replace(/\D/g, '').length >= 8 ? '' : 'corto');
    f.correo2.setCustomValidity(f.correo2.value.trim().toLowerCase() === f.correo.value.trim().toLowerCase() ? '' : 'distinto');
    if (!f.checkValidity()) {
      const mal = [...f.elements].find((x) => x.willValidate && !x.checkValidity());
      err.textContent = !mal ? '' : mal.name === 'correo2' ? 'Los dos correos no coinciden.' : 'Revisá los datos marcados antes de continuar.';
      f.classList.add('form--revisar'); if (mal) mal.focus();
      return;
    }
    const d = Object.fromEntries(new FormData(f));
    const dni = String(d.dni).replace(/\D/g, '');
    const limpio = (v) => String(v).replace(/\s+/g, ' ').trim();
    $('#confirmarDatos').innerHTML = [
      ['Nombre completo', `${limpio(d.nombre)} ${limpio(d.apellido)}`],
      ['DNI', Number(dni).toLocaleString('es-AR')],
      ['Correo', limpio(d.correo).toLowerCase()],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
    $('#confirmoDatos').checked = false;
    $('#botonPagar').disabled = true;
    $('#formBoton').hidden = true;
    $('#formConfirmar').hidden = false;
    $('#formConfirmar .confirmar-titulo').focus();
  }

  function prepararConfirmacion(i) {
    const f = $('#formInsc');
    const cerrar = () => { $('#formConfirmar').hidden = true; $('#formBoton').hidden = false; };
    $('#confirmoDatos').addEventListener('change', (e) => { $('#botonPagar').disabled = !e.target.checked; });
    $('#botonCorregir').addEventListener('click', () => { cerrar(); f.nombre.focus(); });
    // Si cambia cualquier dato con la confirmación abierta, hay que volver a confirmar.
    f.addEventListener('input', (e) => { if (!$('#formConfirmar').hidden && e.target.id !== 'confirmoDatos') cerrar(); });
    $('#botonPagar').addEventListener('click', () => pagar(i));
  }

  // Paso 2: datos confirmados → pedir el link de pago al Worker.
  async function respuestaTurnstile(f, ms) {
    const leer = () => {
      const campo = f.querySelector('[name="cf-turnstile-response"]');
      return turnstileToken || (campo && campo.value) || (window.turnstile && turnstileId !== null && window.turnstile.getResponse(turnstileId)) || '';
    };
    const fin = Date.now() + ms;
    let t = leer();
    while (!t && Date.now() < fin) { await new Promise((ok) => setTimeout(ok, 250)); t = leer(); }
    return t;
  }

  async function pagar(i) {
    const f = $('#formInsc'), err = $('#formError'), btn = $('#botonPagar');
    const textoBoton = btn.textContent;
    err.textContent = '';
    btn.disabled = true; btn.textContent = 'Verificando…';
    // Turnstile renueva su respuesta cada tanto: si justo se está renovando, se esperan unos segundos.
    const token = i.turnstile ? await respuestaTurnstile(f, 8000) : '';
    if (i.turnstile && !token) {
      err.textContent = 'No se pudo completar la verificación de seguridad (el recuadro de arriba). Esperá unos segundos y volvé a tocar el botón.';
      btn.disabled = false; btn.textContent = textoBoton;
      return;
    }

    const datos = Object.fromEntries(new FormData(f));
    delete datos.correo2; delete datos['cf-turnstile-response'];
    btn.disabled = true; btn.textContent = 'Generando el pago…';
    try {
      const r = await llamar(i, '/inscribir', { ...datos, intento_id: INTENTO, turnstile: token });
      if (r.ok && r.pago_url) {
        pixel('InitiateCheckout', { value: Number(i.precio) || 0, currency: 'ARS' });
        location.href = r.pago_url; return;
      }
      if (r.error === 'correo_dominio' && r.sugerencia) {
        err.textContent = `Revisá el correo: ¿quisiste escribir ${r.sugerencia}? Corregilo en los dos campos y volvé a continuar.`;
        $('#formConfirmar').hidden = true; $('#formBoton').hidden = false; f.correo.focus();
      } else if (r.error === 'correo_dominio') {
        $('#formConfirmar').hidden = true; $('#formBoton').hidden = false; f.correo.focus();
      }
      if (!err.textContent) err.textContent = ERRORES[r.error] || (r.error === 'datos' && CAMPOS[r.campo] ? `Revisá ${CAMPOS[r.campo]}.` : 'No pudimos generar el pago. Probá de nuevo en unos minutos: no se cobró nada.');
    } catch (x) {
      err.textContent = 'No pudimos conectarnos. Revisá tu conexión y probá de nuevo: no se cobró nada.';
    }
    // Cada respuesta de Turnstile sirve una sola vez: se pide otra para el próximo intento.
    turnstileToken = '';
    if (window.turnstile && turnstileId !== null) window.turnstile.reset(turnstileId);
    btn.disabled = false; btn.textContent = textoBoton;
  }

  // Vuelta desde Mercado Pago: ?pago=aprobado|pendiente|rechazado. Mercado
  // Pago agrega payment_id y external_reference; con eso el servidor confirma
  // el pago y devuelve la entrada para mostrarla acá mismo.
  async function retornoPago(i, puedeReintentar = true) {
    const q = new URLSearchParams(location.search);
    const estado = q.get('pago');
    if (!estado) return;
    const pagoId = q.get('payment_id') || q.get('collection_id');
    const referencia = q.get('external_reference');
    const msj = $('#inscMensaje');
    const mostrar = (titulo, texto, extra = '') => {
      msj.innerHTML = `<p class="insc-estado">${esc(titulo)}</p><p class="insc-texto">${esc(texto)}</p>${extra}`;
      msj.hidden = false;
    };
    setTimeout(() => $('#inscripcion').scrollIntoView({ block: 'start' }), 50);

    if (estado === 'rechazado') {
      mostrar('El pago no se completó', puedeReintentar ? 'No se cobró nada. Podés intentarlo de nuevo con otro medio de pago, con el mismo DNI.' : 'No se cobró nada.');
      return;
    }
    $('#inscForm').hidden = true;
    if (!pagoId || pagoId === 'null' || !referencia) {
      mostrar('Estamos confirmando tu pago', 'Apenas Mercado Pago lo confirme te llega la entrada por mail. No hace falta que vuelvas a inscribirte.');
      return;
    }
    mostrar('Confirmando tu pago…', 'Esto tarda unos segundos.');
    for (let vuelta = 0; vuelta < 4; vuelta++) {
      try {
        const r = await llamar(i, '/verificar', { pago_id: pagoId, referencia });
        if (r.ok && r.estado === 'pagado' && r.codigo) {
          // Una sola vez por entrada (la página se puede recargar); el eventID permite deduplicar con la API de conversiones.
          try {
            const marca = 'efs_purchase_' + r.codigo;
            if (!localStorage.getItem(marca)) { pixel('Purchase', { value: Number(i.precio) || 0, currency: 'ARS' }, { eventID: r.codigo }); localStorage.setItem(marca, '1'); }
          } catch (x) { pixel('Purchase', { value: Number(i.precio) || 0, currency: 'ARS' }, { eventID: r.codigo }); }
          mostrar('¡Listo, ya tenés tu entrada!', `Hola ${r.nombre || ''}. Este QR es tu entrada: mostralo en la acreditación. También te lo mandamos por mail.`, entradaHtml(r.codigo));
          window.EFSQR && window.EFSQR.dibujar($('#entradaQr'), r.codigo, $('#entradaGuardar'));
          return;
        }
        if (r.ok === false && r.error === 'no_coincide') break;
      } catch (x) { /* se reintenta */ }
      await new Promise((ok) => setTimeout(ok, 3000));
    }
    mostrar('Estamos confirmando tu pago', 'En unos minutos te llega la entrada por mail (revisá también spam). No hace falta que vuelvas a inscribirte ni a pagar. Si en una hora no te llegó, escribinos por mail.');
  }

  function entradaHtml(codigo) {
    return `
      <div class="entrada">
        <div class="entrada-qr" id="entradaQr" role="img" aria-label="Código QR de tu entrada ${esc(codigo)}"></div>
        <p class="entrada-codigo">${esc(codigo)}</p>
        <div class="entrada-acciones">
          <a class="btn btn--blanco" id="entradaGuardar" download="entrada-${esc(codigo)}.gif" href="#">Guardar imagen</a>
          <a class="btn btn--linea-blanca" href="entrada/#${esc(codigo)}">Abrir mi entrada</a>
        </div>
      </div>`;
  }

  // ── programa
  function tarjeta(a) {
    const cat = categoria(a.tipo);
    const id = 'actividad-' + slug(a.titulo);
    if (cat === 'info') {
      return `<div class="act act--especial"><p class="act-titulo">${esc(a.titulo)}</p>${a.descripcion ? `<p class="act-desc">${esc(a.descripcion)}</p>` : ''}</div>`;
    }
    const nombres = (a.disertantes || []).map((d) => d.nombre).filter(Boolean).join(', ');
    return `<article class="act act--${cat}" data-cat="${cat}" id="${id}">
      ${a.imagen ? `<div class="act-img" data-img="${esc(a.imagen)}" data-tinta="${TINTA[cat]}"></div>` : ''}
      <div class="act-cuerpo">
        <p class="act-cat"><span class="cat cat--${cat}">${esc(a.tipo)}</span>${a.area ? `<span class="act-area">${esc(a.area)}</span>` : ''}</p>
        <h4 class="act-titulo">${esc(a.titulo)}</h4>
        ${nombres ? `<p class="act-quien">${esc(nombres)}</p>` : ''}
        <p class="act-meta">${esc([horario(a), a.lugar].filter(Boolean).join(', '))}</p>
        <a class="act-mas" href="#${id}" data-abrir="${id}">Ver detalle<span class="sr"> de ${esc(a.titulo)}</span></a>
      </div>
    </article>`;
  }

  function programa(acts) {
    const cont = $('#programaLista');
    const visibles = acts.filter((a) => a && a.titulo && !a.oculta && a.publicada !== false);
    if (!visibles.length) return;
    const grupos = new Map();
    visibles.sort((x, y) => String(x.inicio).localeCompare(String(y.inicio))).forEach((a) => {
      const k = a.inicio || 'Horario a confirmar';
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(a);
    });
    cont.innerHTML = [...grupos].map(([h, lista]) => `
      <div class="bloque">
        <h3 class="bloque-hora">${esc(h)}</h3>
        <div class="bloque-acts">${lista.map(tarjeta).join('')}</div>
      </div>`).join('');
    cont.querySelectorAll('.act-img').forEach((n) => EFSTrama.aplicar(n, n.dataset.img, { tinta: n.dataset.tinta, retiro: 'bottom', desde: .55, hasta: 1.02, celda: 4 }));
    const hayTalleres = visibles.some((a) => categoria(a.tipo) === 'taller');
    const hayCharlas = visibles.some((a) => categoria(a.tipo) === 'charla');
    $('#filtros').hidden = !(hayTalleres && hayCharlas);
  }

  $('#filtros').addEventListener('click', (e) => {
    const b = e.target.closest('.filtro'); if (!b) return;
    document.querySelectorAll('.filtro').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const f = b.dataset.filtro;
    document.querySelectorAll('#programaLista .act').forEach((a) => { a.hidden = f !== 'todas' && a.dataset.cat !== f; });
    document.querySelectorAll('#programaLista .bloque').forEach((bl) => { bl.hidden = ![...bl.querySelectorAll('.act')].some((a) => !a.hidden); });
  });

  // ── detalle (diálogo)
  let ACTS = [];
  function abrir(id) {
    const a = ACTS.find((x) => 'actividad-' + slug(x.titulo) === id);
    if (!a) return;
    const cat = categoria(a.tipo);
    const d = $('#detalle');
    d.className = `detalle detalle--${cat}`;
    $('#detalleCont').innerHTML = `
      <div class="franja franja--${cat}" aria-hidden="true"><span><b>${esc(a.tipo)}</b>${a.area ? `<i>${esc(a.area)}</i>` : ''}</span></div>
      <button class="detalle-cerrar" type="button" aria-label="Cerrar">×</button>
      ${a.imagen ? `<div class="detalle-img" data-img="${esc(a.imagen)}"></div>` : ''}
      <div class="detalle-cuerpo">
        ${horario(a) ? `<span class="etiqueta">${esc(horario(a))}</span>` : ''}
        <h3 class="detalle-titulo" id="detalleTitulo">${esc(a.titulo)}</h3>
        ${(a.temas || []).length ? `<ul class="temas temas--${cat}">${a.temas.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
        ${a.descripcion ? `<p class="detalle-desc">${esc(a.descripcion)}</p>` : ''}
        <dl class="datos">
          ${a.lugar ? `<div><dt>Lugar</dt><dd>${esc(a.lugar)}</dd></div>` : ''}
          ${horario(a) ? `<div><dt>Horario</dt><dd>${esc(horario(a))}</dd></div>` : ''}
          ${a.cupo ? `<div><dt>Cupo</dt><dd>${esc(a.cupo)} personas</dd></div>` : ''}
          ${a.inscripcion_previa ? `<div><dt>Inscripción</dt><dd>Previa, con cupo</dd></div>` : ''}
        </dl>
        ${(a.disertantes || []).length ? `<div class="detalle-disertantes">${a.disertantes.map(persona).join('')}</div>` : ''}
      </div>`;
    const img = $('.detalle-img', d);
    if (img) EFSTrama.aplicar(img, img.dataset.img, { tinta: TINTA[cat], retiro: 'bottom', desde: .6, hasta: 1.02, celda: 4 });
    d.querySelectorAll('.persona-foto').forEach((n) => EFSTrama.aplicar(n, n.dataset.img, { tinta: TINTA[cat], retiro: 'radial', desde: .5, hasta: .95, celda: 3 }));
    $('.detalle-cerrar', d).addEventListener('click', () => d.close());
    if (!d.open) d.showModal();
    history.replaceState(null, '', '#' + id);
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-abrir]');
    if (b) { e.preventDefault(); abrir(b.dataset.abrir); }
  });
  $('#detalle').addEventListener('click', (e) => { if (e.target.id === 'detalle') e.target.close(); });
  $('#detalle').addEventListener('close', () => history.replaceState(null, '', location.pathname + location.search));

  // ── disertantes
  function persona(d) {
    return `<div class="persona">
      ${d.foto ? `<div class="persona-foto" data-img="${esc(d.foto)}"></div>` : ''}
      <div class="expositor"><b>${esc(d.nombre)}</b>${d.rol ? `<span>${esc(d.rol)}</span>` : ''}${d.institucion ? `<small>${esc(d.institucion)}</small>` : ''}</div>
    </div>`;
  }
  function disertantes(acts) {
    const vistos = new Map();
    acts.filter((a) => !a.oculta && a.publicada !== false).forEach((a) => (a.disertantes || []).forEach((d) => {
      if (!d || !d.nombre) return;
      const k = d.nombre.trim().toLowerCase();
      const prev = vistos.get(k) || { ...d, actividades: [] };
      prev.foto = prev.foto || d.foto; prev.rol = prev.rol || d.rol; prev.institucion = prev.institucion || d.institucion;
      prev.actividades.push(a.titulo);
      vistos.set(k, prev);
    }));
    const lista = [...vistos.values()];
    const sec = $('#disertantes');
    sec.hidden = !lista.length;
    document.querySelector('[data-si="disertantes"]').hidden = !lista.length;
    if (!lista.length) return;
    $('#disertantesLista').innerHTML = lista.map(persona).join('');
    $('#disertantesLista').querySelectorAll('.persona-foto').forEach((n) => EFSTrama.aplicar(n, n.dataset.img, { tinta: TINTA.charla, retiro: 'radial', desde: .5, hasta: .95, celda: 3 }));
  }

  // ── edición anterior
  function anterior(arch, mostrar) {
    if (!arch || !mostrar) return;
    $('#anterior-titulo').textContent = `Así fue la ${arch.edicion || 'edición anterior'}`;
    const fotos = (arch.fotos || []).filter((f) => f && f.imagen);
    const intro = `<div class="anterior-intro"><p class="anterior-fecha">${esc(arch.fecha || '')}</p><p>${esc(arch.resumen || '')}</p></div>`;
    // Solo intro y fotos: las charlas de esa edición ya no se listan (para no confundirlas con el programa de esta).
    $('#anteriorCont').innerHTML = intro + (fotos.length
      ? `<div class="galeria" role="list">${fotos.map((f) => `<figure class="galeria-foto" role="listitem"><img src="${esc(f.imagen)}" alt="${esc(f.descripcion || 'Foto de la ' + (arch.edicion || 'edición anterior'))}" loading="lazy" decoding="async"></figure>`).join('')}</div>`
      : '');
    $('#edicion-anterior').hidden = false;
  }

  // ── separadores: franja de foto con la trama EFS
  document.querySelectorAll('.separador[data-img]').forEach((n) => {
    const foco = (n.dataset.foco || '.5,.5').split(',').map(Number);
    EFSTrama.aplicar(n, n.dataset.img, { tinta: '#2C6FA0', retiro: 'bottom', desde: .72, hasta: 1.05, celda: 2, foco });
  });

  // ── carga
  Promise.all([cargar('assets/data/evento.json'), cargar('assets/data/actividades.json'), cargar('assets/data/archivo/edicion-1.json')])
    .then(([ev, acts, arch]) => {
      aplicarEvento(ev);
      ACTS = DEMO && arch ? arch.actividades : (Array.isArray(acts) ? acts : []);
      if (DEMO) document.body.insertAdjacentHTML('afterbegin', '<p class="aviso-demo">Vista de ejemplo con el programa de la 1.ª edición. Sin <code>?demo</code> se ve el contenido real.</p>');
      programa(ACTS);
      disertantes(ACTS);
      anterior(arch, ev ? ev.mostrar_edicion_anterior !== false : true);
      if (location.hash.startsWith('#actividad-')) abrir(location.hash.slice(1));
    });
})();
