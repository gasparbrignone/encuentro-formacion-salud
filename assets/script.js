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
    if (c.whatsapp) $('[data-contacto="whatsapp"]').href = 'https://wa.me/' + String(c.whatsapp).replace(/\D/g, '');
    if (c.telefono) { const t = $('[data-contacto="telefono"]'); t.href = 'tel:' + String(c.telefono).replace(/[^\d+]/g, ''); t.textContent = c.telefono; $('[data-contacto="whatsapp"]').textContent = c.telefono; }
    inscripcion(ev.inscripcion || {});
  }

  function inscripcion(i) {
    const cont = $('#inscripcionCont');
    const cta = $('[data-evento="cta"]');
    if (i.estado === 'abierta' && i.link) {
      cont.innerHTML = `
        <p class="insc-estado">Inscripción abierta</p>
        <p class="insc-texto">${esc(i.texto || 'Es gratis y lleva dos minutos. Los talleres tienen cupo: elegilos al inscribirte.')}</p>
        <ol class="pasos">
          <li><span>01</span><b>Ingresá</b> al formulario de inscripción</li>
          <li><span>02</span><b>Completá tus datos</b> nombre, correo y carrera</li>
          <li><span>03</span><b>Elegí tus talleres</b> tienen cupo</li>
          <li><span>04</span><b>Confirmá</b> te llega un correo con tu inscripción</li>
        </ol>
        <a class="btn btn--blanco" href="${esc(i.link)}" target="_blank" rel="noopener">Inscribirme</a>`;
      cta.textContent = 'Inscribirme'; cta.href = i.link; cta.target = '_blank'; cta.rel = 'noopener';
    } else if (i.estado === 'cerrada') {
      cont.innerHTML = `<p class="insc-estado">Inscripción cerrada</p><p class="insc-texto">${esc(i.texto || 'Ya cerramos la inscripción para esta edición. Si tenés dudas, escribinos por WhatsApp.')}</p>`;
    } else if (i.texto) {
      $('.insc-texto', cont).textContent = i.texto;
    }
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
    const acts = (arch.actividades || []).filter((a) => categoria(a.tipo) !== 'info');
    $('#anterior-titulo').textContent = `Así fue la ${arch.edicion || 'edición anterior'}`;
    $('#anteriorCont').innerHTML = `
      <div class="anterior-intro"><p class="anterior-fecha">${esc(arch.fecha || '')}</p><p>${esc(arch.resumen || '')}</p></div>
      <ul class="anterior-lista">${acts.map((a) => `<li><span class="cat cat--${categoria(a.tipo)}">${esc(a.tipo)}</span><b>${esc(a.titulo)}</b><small>${esc((a.disertantes || []).map((d) => d.nombre).join(', '))}</small></li>`).join('')}</ul>`;
    $('#edicion-anterior').hidden = false;
  }

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
