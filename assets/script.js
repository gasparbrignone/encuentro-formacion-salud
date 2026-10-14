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
    else if (Number(i.precio) > 0) tema.textContent = 'Inscripción: ' + pesos(i.precio) + (promoActiva(i) ? ' · 2x1: dos entradas por ' + pesos(i.precio) : '');
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

  // Promo 2x1: una persona paga el precio y carga también los datos de un acompañante. El sitio muestra
  // la opción entre promo_2x1_desde y promo_2x1_hasta; la que manda de verdad es la planilla (promo_2x1 = SI).
  function promoActiva(i) {
    if (i.promo_2x1 !== true || i.estado !== 'abierta') return false;
    const ahora = Date.now();
    const desde = i.promo_2x1_desde ? Date.parse(i.promo_2x1_desde) : NaN;
    const hasta = i.promo_2x1_hasta ? Date.parse(i.promo_2x1_hasta) : NaN;
    return !(desde > ahora) && !(hasta < ahora);
  }

  function inscripcion(i, contacto = {}) {
    i = estadoPorFecha(i);
    i = { ...i, promo: promoActiva(i) };
    const cont = $('#inscripcionCont');
    const cta = $('[data-evento="cta"]');
    precioInicio(i);
    const conPago = i.modo === 'mercadopago' && i.servicio;
    const volviendoDelPago = new URLSearchParams(location.search).has('pago');

    // Link de invitación (?inv=INV-XXXXXXXX): mismo formulario, sin pago. Si el link sirve o no lo
    // decide el servidor, por eso se muestra aunque la inscripción general figure cerrada.
    if (INVITACION && conPago && !volviendoDelPago) {
      cont.innerHTML = formularioPago(i, contacto, true);
      cta.textContent = 'Inscribite'; cta.href = '#inscripcion';
      $('#formInsc').addEventListener('submit', (e) => enviarInscripcion(e, i));
      prepararConfirmacion(i);
      cargarTurnstile(i);
      verInvitacion(i);
      return;
    }

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
      medirInicioFormulario(i);
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
      cont.innerHTML = `
        <p class="insc-estado">Próximamente</p>
        <p class="insc-texto">${esc(i.texto || 'Todavía no abrimos las inscripciones para esta edición. Seguinos en Instagram para enterarte apenas abran.')}</p>
        <a class="btn btn--blanco" href="https://instagram.com/efs.atp" target="_blank" rel="noopener">Seguinos en @efs.atp</a>`;
    }
  }

  // Formulario con pago por Mercado Pago. Habla con el Worker del EFS
  // (i.servicio = su dirección), que verifica Turnstile y pasa el pedido al
  // Apps Script de ATP. Ver docs/EFS_2026_PLAN.md en el repo de la plataforma.
  const INTENTO = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(16).slice(2);
  let turnstileId = null;
  let turnstileToken = '';
  // Código del link de invitación con el que se abrió la página, o '' si es una visita común.
  const INVITACION = (() => {
    const v = (new URLSearchParams(location.search).get('inv') || '').trim().toUpperCase();
    return /^INV-[0-9A-Z]{8}$/.test(v) ? v : '';
  })();

  const ERRORES = {
    turnstile: 'No pudimos comprobar que no sos un robot. Recargá la página y probá de nuevo.',
    demasiados_intentos: 'Hiciste varios intentos seguidos. Esperá unos minutos y volvé a probar.',
    ya_inscripto: 'Ya hay una inscripción con ese documento. Tu entrada está en el mail que te mandamos (revisá también spam). Si no la encontrás, escribinos por mail.',
    acomp_ya_inscripto: 'Tu acompañante ya tiene una entrada con ese documento. Elegí "Voy solo/a" o cargá los datos de otra persona.',
    acomp_mismo_dni: 'El documento de tu acompañante es igual al tuyo. Revisalo.',
    promo_cerrada: 'La promo 2x1 ya no está disponible. Podés inscribirte con la opción "Voy solo/a".',
    cerrada: 'La inscripción está cerrada.',
    correo_dominio: 'Ese correo no parece existir: revisá lo que está después de la @.',
    invitacion: 'Este link de invitación no es válido. Pedile a quien te invitó que te lo mande de nuevo.',
    invitacion_agotada: 'Este link de invitación ya se usó todas las veces que tenía disponibles.',
  };
  const CAMPOS = { nombre: 'el nombre', apellido: 'el apellido', dni: 'el documento', telefono: 'el teléfono', correo: 'el correo', carrera: 'la carrera', anio: 'el año', universidad: 'la universidad' };
  Object.keys(CAMPOS).forEach((k) => { CAMPOS['acomp_' + k] = CAMPOS[k] + ' de tu acompañante'; });

  // inv = true: se abrió con un link de invitación. Mismos datos, sin precio ni Mercado Pago.
  function formularioPago(i, contacto = {}, inv = false) {
    const precio = !inv && Number(i.precio) > 0 ? pesos(i.precio) : '';
    const email = String(contacto.email || '').trim();
    const anios = ['1.º', '2.º', '3.º', '4.º', '5.º', '6.º', 'Internado / PFO', 'Egresado/a', 'Otro'];
    const carreras = ['Medicina', 'Enfermería', 'Fonoaudiología', 'Obstetricia', 'Psicología', 'Nutrición', 'Kinesiología', 'Odontología', 'Bioquímica'];
    const promo = !inv && i.promo;
    // Mismos campos para quien se inscribe y para el acompañante del 2x1 (con "acomp_" adelante y sin autocompletar).
    const campos = (pre = '') => {
      const auto = (v) => (pre ? 'off' : v);
      return `
          <div class="form-grilla">
            <label>Nombre<input name="${pre}nombre" autocomplete="${auto('given-name')}" required maxlength="60"></label>
            <label>Apellido<input name="${pre}apellido" autocomplete="${auto('family-name')}" required maxlength="60"></label>
            <label>Documento<span class="form-doc"><select name="${pre}doc" aria-label="Tipo de documento"><option value="dni">DNI</option><option value="pas">Pasaporte</option></select><input name="${pre}dni" aria-label="Número de documento" inputmode="numeric" required pattern="[0-9.\\s]{7,11}" maxlength="11" placeholder="Solo números"></span></label>
            <label>Teléfono<input name="${pre}telefono" type="tel" autocomplete="${auto('tel')}" required minlength="8" maxlength="30" placeholder="Ej.: 341 555-1234"></label>
            <label>Correo electrónico<input name="${pre}correo" type="email" autocomplete="${auto('email')}" required maxlength="120"></label>
            <label>Repetí el correo<input name="${pre}correo2" type="email" autocomplete="off" required maxlength="120"></label>
            <label>Carrera<input name="${pre}carrera" list="carreras" required maxlength="80"></label>
            <label>Año que cursás<select name="${pre}anio" required><option value="">Elegí</option>${anios.map((a) => `<option>${a}</option>`).join('')}</select></label>
            <label class="form-ancho">Universidad<input name="${pre}universidad" required maxlength="100" value="Universidad Nacional de Rosario"></label>
          </div>`;
    };
    return `
      <div id="inscMensaje" class="insc-mensaje" hidden role="status" aria-live="polite"></div>
      <div id="inscForm">
        ${inv ? `
        <p class="insc-estado">Tenés una invitación</p>
        <p class="insc-texto" id="invTexto">Tu entrada al EFS es gratis. Completá tus datos: la ves en pantalla y te llega por mail.</p>` : `
        <p class="insc-estado">Inscripción abierta</p>
        <p class="insc-texto">${esc(i.texto || `Completá tus datos y pagá la inscripción${precio ? ` (${precio})` : ''} con Mercado Pago. Apenas se aprueba el pago ves tu entrada en pantalla y te llega por mail.`)}</p>
        <ol class="pasos pasos--cortos">
          <li><span>01</span><b>Completá tus datos</b></li>
          <li><span>02</span><b>Pagá con Mercado Pago</b> débito, crédito o dinero en cuenta</li>
          <li><span>03</span><b>Recibí tu entrada</b> un código QR personal</li>
        </ol>`}
        <form class="form" id="formInsc" novalidate>
          <datalist id="carreras">${carreras.map((c) => `<option value="${c}">`).join('')}</datalist>
          ${promo ? `
          <fieldset class="modo">
            <legend class="modo-titulo">¿Cómo te inscribís?</legend>
            <label class="modo-op"><input type="radio" name="modo" value="solo" checked><span><b>Voy solo/a</b><small>1 entrada · ${precio}</small></span></label>
            <label class="modo-op"><input type="radio" name="modo" value="2x1"><span><b>2x1</b><small>2 entradas · ${precio} en total</small></span></label>
          </fieldset>` : ''}
          <p class="form-aviso">Completá tu nombre, apellido, documento y correo tal como querés que figuren en tu <b>certificado</b>.</p>
          ${campos()}
          ${promo ? `
          <fieldset class="acomp" id="formAcomp" hidden disabled>
            <legend class="acomp-titulo">Tu acompañante</legend>
            <p class="form-aviso">Sus datos, tal como van en su <b>certificado</b>. A su correo le llega su propia entrada.</p>
            ${campos('acomp_')}
          </fieldset>` : ''}
          <div id="turnstile" class="form-turnstile"></div>
          <p class="form-error" id="formError" role="alert"></p>
          <button class="btn btn--blanco" type="submit" id="formBoton">Continuar</button>
          <div class="confirmar" id="formConfirmar" hidden>
            <p class="confirmar-titulo" tabindex="-1">Revisá tus datos</p>
            <p class="confirmar-texto" id="confirmarTexto">Así van a figurar en tu certificado, y a este correo te llega la entrada.</p>
            <dl class="confirmar-datos" id="confirmarDatos"></dl>
            <label class="confirmar-check"><input type="checkbox" id="confirmoDatos"> <span id="confirmoTexto">Revisé mi nombre, documento y correo: están bien escritos.</span></label>
            <div class="confirmar-acciones">
              <button class="btn btn--blanco" type="button" id="botonPagar" disabled>${inv ? 'Confirmar inscripción' : `Ir al pago${precio ? `: ${precio}` : ''}`}</button>
              <button class="btn-chico" type="button" id="botonCorregir">Corregir datos</button>
            </div>
          </div>
          ${inv ? '' : `<p class="form-pie">El costo de la inscripción cubre los materiales de los talleres y la logística del encuentro. ATP es una agrupación estudiantil y el EFS no tiene fines de lucro.</p>
          ${email ? `<a class="btn-chico" href="mailto:${email}?subject=${encodeURIComponent('EFS 2026: no puedo pagar la inscripción')}">¿No podés pagar la inscripción? Escribinos</a>` : ''}`}
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

  // InitiateCheckout: la primera vez que la persona toca un campo del formulario, una vez por sesión.
  function medirInicioFormulario(i) {
    const f = $('#formInsc');
    if (!f) return;
    const marcar = (e) => {
      if (!e.target.matches('input, select') || e.target.id === 'confirmoDatos') return;
      f.removeEventListener('focusin', marcar); f.removeEventListener('input', marcar);
      try {
        if (sessionStorage.getItem('efs_inicio_form')) return;
        sessionStorage.setItem('efs_inicio_form', '1');
      } catch (x) { /* sin sessionStorage: una vez por carga */ }
      pixel('InitiateCheckout', { value: Number(i.precio) || 0, currency: 'ARS', content_name: 'Inscripción EFS 2026' });
    };
    f.addEventListener('focusin', marcar);
    f.addEventListener('input', marcar);
  }

  // CompleteRegistration y Purchase: solo con el pago confirmado por el servidor (la inscripción
  // existe recién ahí). Una vez por pago aunque se recargue la página. El eventID es el número de
  // pago de Mercado Pago, no el código de la entrada (ese código es la entrada misma).
  function medirInscripcionPaga(i, pagoId, codigo) {
    const datos = { value: Number(i.precio) || 0, currency: 'ARS' };
    const marca = 'efs_conversion_' + pagoId;
    try {
      if (localStorage.getItem(marca) || localStorage.getItem('efs_purchase_' + codigo)) return;
      localStorage.setItem(marca, '1');
    } catch (x) { /* sin localStorage: se mide igual */ }
    pixel('CompleteRegistration', { ...datos, content_name: 'Inscripción EFS 2026' }, { eventID: 'efs26-' + pagoId });
    pixel('Purchase', datos, { eventID: 'efs26-' + pagoId });
  }

  function galleta(nombre) {
    const m = document.cookie.match(new RegExp('(?:^|; )' + nombre + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
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
    const dos = es2x1(f);
    const prefijos = dos ? ['', 'acomp_'] : [''];
    prefijos.forEach((pre) => {
      f[pre + 'telefono'].setCustomValidity(f[pre + 'telefono'].value.replace(/\D/g, '').length >= 8 ? '' : 'corto');
      f[pre + 'correo2'].setCustomValidity(f[pre + 'correo2'].value.trim().toLowerCase() === f[pre + 'correo'].value.trim().toLowerCase() ? '' : 'distinto');
    });
    const docClave = (pre) => (f[pre + 'doc'].value === 'pas' ? 'PAS ' + pasaporte(f[pre + 'dni'].value) : f[pre + 'dni'].value.replace(/\D/g, ''));
    if (dos) f.acomp_dni.setCustomValidity(f.acomp_dni.value && docClave('acomp_') === docClave('') ? 'igual' : '');
    if (!f.checkValidity()) {
      const mal = [...f.elements].find((x) => x.willValidate && !x.checkValidity());
      err.textContent = !mal ? '' : /correo2$/.test(mal.name) ? 'Los dos correos no coinciden.'
        : mal.name === 'acomp_dni' && mal.validationMessage === 'igual' ? ERRORES.acomp_mismo_dni : 'Revisá los datos marcados antes de continuar.';
      f.classList.add('form--revisar'); if (mal) mal.focus();
      return;
    }
    const d = Object.fromEntries(new FormData(f));
    const limpio = (v) => String(v).replace(/\s+/g, ' ').trim();
    const persona = (pre, quien) => [
      [quien, `${limpio(d[pre + 'nombre'])} ${limpio(d[pre + 'apellido'])}`],
      d[pre + 'doc'] === 'pas' ? ['Pasaporte', pasaporte(d[pre + 'dni'])] : ['DNI', Number(String(d[pre + 'dni']).replace(/\D/g, '')).toLocaleString('es-AR')],
      ['Correo', limpio(d[pre + 'correo']).toLowerCase()],
    ];
    const filasDatos = dos ? [...persona('', 'Vos'), ...persona('acomp_', 'Tu acompañante')] : persona('', 'Nombre completo');
    $('#confirmarDatos').innerHTML = filasDatos.map(([k, v]) => `<div${k === 'Tu acompañante' ? ' class="confirmar-otra"' : ''}><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
    $('#confirmarTexto').textContent = dos ? 'Así van a figurar en los certificados. Cada entrada llega al correo de su dueño/a.' : 'Así van a figurar en tu certificado, y a este correo te llega la entrada.';
    $('#confirmoTexto').textContent = dos ? 'Revisé los nombres, documentos y correos de las dos personas: están bien escritos.' : 'Revisé mi nombre, documento y correo: están bien escritos.';
    $('#confirmoDatos').checked = false;
    $('#botonPagar').disabled = true;
    $('#formBoton').hidden = true;
    $('#formConfirmar').hidden = false;
    $('#formConfirmar .confirmar-titulo').focus();
  }

  // Quien no tiene DNI argentino se inscribe con pasaporte: letras y números, y viaja como "PAS AB123456".
  const pasaporte = (v) => String(v).replace(/[^0-9a-z]/gi, '').toUpperCase();

  function prepararDocumento(pre = '') {
    const f = $('#formInsc');
    const doc = f[pre + 'doc'], dni = f[pre + 'dni'];
    if (!doc) return;
    doc.addEventListener('change', () => {
      const pas = doc.value === 'pas';
      dni.value = '';
      dni.pattern = pas ? '\\s*([A-Za-z0-9]\\s*){5,15}' : '[0-9.\\s]{7,11}';
      dni.maxLength = pas ? 20 : 11;
      dni.inputMode = pas ? 'text' : 'numeric';
      dni.placeholder = pas ? 'Letras y números' : 'Solo números';
    });
  }

  const es2x1 = (f) => Boolean(f.modo && f.modo.value === '2x1');

  // 2x1: al elegirlo se abre el bloque del acompañante. Cerrado queda deshabilitado: no se valida ni se envía.
  function prepararModo() {
    const f = $('#formInsc'), bloque = $('#formAcomp');
    if (!bloque) return;
    f.querySelectorAll('[name="modo"]').forEach((r) => r.addEventListener('change', () => {
      const dos = es2x1(f);
      bloque.hidden = !dos; bloque.disabled = !dos;
      if (dos) f.acomp_nombre.focus();
    }));
  }

  function prepararConfirmacion(i) {
    prepararDocumento();
    prepararDocumento('acomp_');
    prepararModo();
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
    const dos = !INVITACION && es2x1(f);
    delete datos['cf-turnstile-response']; delete datos.modo;
    ['', 'acomp_'].forEach((pre) => {
      delete datos[pre + 'correo2'];
      if (datos[pre + 'doc'] === 'pas') datos[pre + 'dni'] = 'PAS ' + pasaporte(datos[pre + 'dni']);
      delete datos[pre + 'doc'];
    });
    if (dos) datos.promo = '2x1';
    btn.disabled = true; btn.textContent = INVITACION ? 'Inscribiendo…' : 'Generando el pago…';
    const noSalio = INVITACION ? 'No pudimos completar la inscripción. Probá de nuevo en unos minutos.' : 'No pudimos generar el pago. Probá de nuevo en unos minutos: no se cobró nada.';
    try {
      // Con invitación no hay pago: la entrada vuelve en la misma respuesta. Si se corta la conexión,
      // repetir es seguro (mismo INTENTO = misma entrada).
      // Cookies del píxel (si las hay): el servidor las usa para la API de Conversiones de Meta.
      const r = INVITACION
        ? await llamar(i, '/invitacion', { ...datos, intento_id: INTENTO, turnstile: token, invitacion: INVITACION })
        : await llamar(i, '/inscribir', { ...datos, intento_id: INTENTO, turnstile: token, fbp: galleta('_fbp'), fbc: galleta('_fbc') });
      if (INVITACION && r.ok && r.codigo) {
        $('#inscForm').hidden = true;
        mensajeInscripcion('¡Listo, ya tenés tu entrada!', `Hola ${r.nombre || ''}. Este QR es tu entrada: mostralo en la acreditación. También te lo mandamos por mail.`, entradaHtml(r.codigo));
        window.EFSQR && window.EFSQR.dibujar($('#entradaQr'), r.codigo, $('#entradaGuardar'));
        $('#inscripcion').scrollIntoView({ block: 'start' });
        return;
      }
      if (r.ok && r.pago_url && dos && r.promo !== '2x1') {
        // El servidor no registró al acompañante (por ejemplo, un Apps Script sin el 2x1): no se manda a pagar.
        err.textContent = 'No pudimos registrar el 2x1. Probá de nuevo en unos minutos: no se cobró nada.';
      } else if (r.ok && r.pago_url) {
        // Datos confirmados y link de pago listo: la persona sale a Mercado Pago.
        pixel('AddPaymentInfo', { value: Number(i.precio) || 0, currency: 'ARS' });
        // Unos 300 ms para que el navegador alcance a enviar el evento antes de salir de la página.
        setTimeout(() => { location.href = r.pago_url; }, 300);
        return;
      }
      const deAcomp = r.campo === 'acomp_correo';
      const campoCorreo = deAcomp && f.acomp_correo ? f.acomp_correo : f.correo;
      if (r.error === 'correo_dominio' && r.sugerencia) {
        err.textContent = `Revisá el correo${deAcomp ? ' de tu acompañante' : ''}: ¿quisiste escribir ${r.sugerencia}? Corregilo en los dos campos y volvé a continuar.`;
        $('#formConfirmar').hidden = true; $('#formBoton').hidden = false; campoCorreo.focus();
      } else if (r.error === 'correo_dominio') {
        if (deAcomp) err.textContent = 'El correo de tu acompañante no parece existir: revisá lo que está después de la @.';
        $('#formConfirmar').hidden = true; $('#formBoton').hidden = false; campoCorreo.focus();
      }
      if (!err.textContent) err.textContent = ERRORES[r.error] || (r.error === 'datos' && CAMPOS[r.campo] ? `Revisá ${CAMPOS[r.campo]}.` : noSalio);
    } catch (x) {
      err.textContent = INVITACION ? 'No pudimos conectarnos. Revisá tu conexión y volvé a tocar el botón.' : 'No pudimos conectarnos. Revisá tu conexión y probá de nuevo: no se cobró nada.';
    }
    // Cada respuesta de Turnstile sirve una sola vez: se pide otra para el próximo intento.
    turnstileToken = '';
    if (window.turnstile && turnstileId !== null) window.turnstile.reset(turnstileId);
    btn.disabled = false; btn.textContent = textoBoton;
  }

  // Cartel arriba del formulario: resultado del pago, entrada emitida o link de invitación que no sirve.
  function mensajeInscripcion(titulo, texto, extra = '') {
    const msj = $('#inscMensaje');
    msj.innerHTML = `<p class="insc-estado">${esc(titulo)}</p><p class="insc-texto">${esc(texto)}</p>${extra}`;
    msj.hidden = false;
  }

  // Al abrir un link de invitación: quién invita y si quedan lugares. Si el link no sirve se avisa
  // antes de que la persona complete nada. Si la consulta falla, el formulario queda igual: el
  // servidor vuelve a controlar todo al confirmar.
  async function verInvitacion(i) {
    setTimeout(() => $('#inscripcion').scrollIntoView({ block: 'start' }), 50);
    try {
      const r = await llamar(i, '/invitacion/ver', { invitacion: INVITACION });
      if (r.ok) {
        if (r.titular) $('#invTexto').textContent = `${r.titular} te invitó al EFS: tu entrada es gratis. Completá tus datos, la ves en pantalla y te llega por mail.`;
      } else if (r.error === 'invitacion' || r.error === 'invitacion_agotada' || r.error === 'cerrada') {
        $('#inscForm').hidden = true;
        mensajeInscripcion(r.error === 'cerrada' ? 'Invitaciones cerradas' : r.error === 'invitacion_agotada' ? 'Invitación sin lugares' : 'Invitación no válida',
          r.error === 'cerrada' ? 'Ya cerramos las inscripciones por invitación para esta edición.' : ERRORES[r.error]);
      }
    } catch (x) { /* sin conexión: se intenta igual al confirmar */ }
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
    const mostrar = mensajeInscripcion;
    setTimeout(() => $('#inscripcion').scrollIntoView({ block: 'start' }), 50);

    if (estado === 'rechazado') {
      mostrar('El pago no se completó', puedeReintentar ? 'No se cobró nada. Podés intentarlo de nuevo con otro medio de pago, con el mismo documento.' : 'No se cobró nada.');
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
          medirInscripcionPaga(i, pagoId, r.codigo);
          if (r.codigo2) {
            // 2x1: las dos entradas en pantalla, cada una con su nombre.
            mostrar('¡Listo, ya tienen sus entradas!', `Hola ${r.nombre || ''}. Cada persona muestra su QR en la acreditación. A cada una también le llega el suyo por mail.`,
              `<div class="entradas">${entradaHtml(r.codigo, '', r.nombre)}${entradaHtml(r.codigo2, '2', r.nombre2)}</div>`);
            window.EFSQR && window.EFSQR.dibujar($('#entradaQr2'), r.codigo2, $('#entradaGuardar2'));
          } else {
            mostrar('¡Listo, ya tenés tu entrada!', `Hola ${r.nombre || ''}. Este QR es tu entrada: mostralo en la acreditación. También te lo mandamos por mail.`, entradaHtml(r.codigo));
          }
          window.EFSQR && window.EFSQR.dibujar($('#entradaQr'), r.codigo, $('#entradaGuardar'));
          return;
        }
        if (r.ok === false && r.error === 'no_coincide') break;
      } catch (x) { /* se reintenta */ }
      await new Promise((ok) => setTimeout(ok, 3000));
    }
    mostrar('Estamos confirmando tu pago', 'En unos minutos te llega la entrada por mail (revisá también spam). No hace falta que vuelvas a inscribirte ni a pagar. Si en una hora no te llegó, escribinos por mail.');
  }

  function entradaHtml(codigo, n = '', nombre = '') {
    return `
      <div class="entrada">
        ${nombre ? `<p class="entrada-nombre">${esc(nombre)}</p>` : ''}
        <div class="entrada-qr" id="entradaQr${n}" role="img" aria-label="Código QR de la entrada ${esc(codigo)}"></div>
        <p class="entrada-codigo">${esc(codigo)}</p>
        <div class="entrada-acciones">
          <a class="btn btn--blanco" id="entradaGuardar${n}" download="entrada-${esc(codigo)}.gif" href="#">Guardar imagen</a>
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
    const con = (a.disertantes || []).filter((d) => d && d.nombre);
    const d1 = con[0];
    const temas = (a.temas || []).filter(Boolean);
    return `<article class="act act--${cat}" data-cat="${cat}" id="${id}">
      ${a.imagen ? `<div class="act-img" data-img="${esc(a.imagen)}" data-tinta="${TINTA[cat]}"></div>` : ''}
      <div class="act-cuerpo">
        <p class="act-cat"><span class="cat cat--${cat}">${esc(a.tipo)}</span>${a.area ? `<span class="act-area">${esc(a.area)}</span>` : ''}</p>
        <h4 class="act-titulo">${esc(a.titulo)}</h4>
        ${a.descripcion ? `<p class="act-desc">${esc(a.descripcion)}</p>` : ''}
        ${temas.length ? `<ul class="temas temas--chico" aria-label="Temas">${temas.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
        ${d1 ? `<div class="act-quien">
          ${con.some((d) => d.foto) ? `<span class="act-fotos">${con.filter((d) => d.foto).map((d) => `<span class="act-foto"><img src="${esc(d.foto)}" alt="" loading="lazy" decoding="async"></span>`).join('')}</span>` : ''}
          <span><b>${esc(con.map((d) => d.nombre).join(', '))}</b>${con.length === 1 && d1.rol ? `<small>${esc(d1.rol)}</small>` : ''}</span>
        </div>` : ''}
        <p class="act-meta">${esc([horario(a), a.lugar].filter(Boolean).join(', '))}</p>
      </div>
      <a class="btn btn--navy act-mas" href="#${id}" data-abrir="${id}">Ver detalle<span class="sr"> de ${esc(a.titulo)}</span></a>
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
      <div class="detalle-cuerpo${a.imagen ? '' : ' sin-img'}">
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
      ${d.foto ? `<div class="persona-foto"><img src="${esc(d.foto)}" alt="" loading="lazy" decoding="async"></div>` : `<div class="persona-foto persona-foto--ini" aria-hidden="true">${esc(d.nombre.trim().split(/\s+/).filter((p) => /^\p{Lu}/u.test(p) && p.length > 2).map((p) => p[0]).slice(0, 2).join(''))}</div>`}
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

  // ── separadores: fotos ya tramadas (assets/img/sep-N.png). Antes las dibujaba trama.js y trababa la página varios segundos.

  // ── animación de entrada: cada tarjeta sube al entrar en pantalla (escalonada); con "reducir movimiento" se ve directo (CSS)
  function revelar(sel) {
    const els = [...document.querySelectorAll(sel)];
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('visto')); return; }
    const io = new IntersectionObserver((ents) => ents.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('visto'); io.unobserve(en.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach((e, i) => { e.classList.add('rv'); e.style.setProperty('--d', (i % 4) * 90 + 'ms'); io.observe(e); });
  }

  // ── carga
  // El evento (y con él la inscripción) se aplica apenas llega, sin esperar al programa ni al archivo.
  // Si no carga, se reintenta; si igual falla, se avisa en vez de dejar la inscripción como "cargando".
  const cargarEvento = async () => {
    for (let intento = 0; intento < 3; intento++) {
      const ev = await cargar('assets/data/evento.json');
      if (ev) return ev;
      await new Promise((r) => setTimeout(r, 800 * (intento + 1)));
    }
    return null;
  };
  const eventoListo = cargarEvento().then((ev) => {
    if (ev) { try { aplicarEvento(ev); } catch (err) { console.error(err); } }
    else $('#inscripcionCont').innerHTML = `
      <p class="insc-texto">No pudimos cargar la inscripción. Revisá tu conexión y volvé a intentar.</p>
      <button type="button" class="btn btn--blanco" onclick="location.reload()">Recargar la página</button>`;
    return ev;
  });
  Promise.all([eventoListo, cargar('assets/data/actividades.json'), cargar('assets/data/archivo/edicion-1.json')])
    .then(([ev, acts, arch]) => {
      ACTS = DEMO && arch ? arch.actividades : (Array.isArray(acts) ? acts : []);
      if (DEMO) document.body.insertAdjacentHTML('afterbegin', '<p class="aviso-demo">Vista de ejemplo con el programa de la 1.ª edición. Sin <code>?demo</code> se ve el contenido real.</p>');
      programa(ACTS);
      disertantes(ACTS);
      revelar('.act, .persona');
      anterior(arch, ev ? ev.mostrar_edicion_anterior !== false : true);
      if (location.hash.startsWith('#actividad-')) abrir(location.hash.slice(1));
    });
})();
