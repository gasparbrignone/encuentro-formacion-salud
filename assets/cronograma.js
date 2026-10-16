/* EFS · cronograma del día (efsarg.com.ar/cronograma/)
   Datos: assets/data/cronograma.json (franjas horarias y qué pasa en cada espacio).
   El detalle de cada actividad (descripción y disertantes) sale de assets/data/actividades.json,
   buscando por el campo "programa" (el título tal como figura en el Programa del sitio).
   El día del evento marca lo que pasa ahora. Para probarlo otro día: ?ahora=10:45
*/
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const texto = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const cargar = (url) => fetch(url, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const min = (h) => { const [a, b] = String(h).split(':').map(Number); return a * 60 + (b || 0); };
  const idHora = (h) => 'h' + String(h).replace(':', '');

  // Ubicación de cada aula en assets/img/plano-fcm.png (en % del ancho y alto de la imagen).
  // Azul: anfiteatros (charlas). Teal: CECECAP Grande (talleres).
  const PLANO = {
    'Anf. Ferrandini': { x: 50.2, y: 22.5, tinta: 'charla' },
    'Anf. Anatomía Patológica': { x: 7.1, y: 69.5, tinta: 'charla' },
    'CECECAP Grande': { x: 24.2, y: 66.4, tinta: 'taller' },
  };

  // ── tarjetas
  function persona(d) {
    const ini = d.nombre.trim().split(/\s+/).filter((p) => /^\p{Lu}/u.test(p) && p.length > 2).map((p) => p[0]).slice(0, 2).join('');
    return `<div class="ac-persona">
      <span class="ac-foto">${d.foto ? `<img src="../${esc(d.foto)}" alt="" loading="lazy" decoding="async">` : `<b aria-hidden="true">${esc(ini)}</b>`}</span>
      <span><b>${esc(d.nombre)}</b>${d.rol ? `<small>${esc(d.rol)}</small>` : ''}</span>
    </div>`;
  }

  // Una fila por actividad: título y aula. Lo demás (tipo, quién, descripción) se abre al tocarla.
  // Los espacios sin actividad no se muestran.
  function fila(a, esp, prog) {
    const cab = `<span class="ac-t">${esc(a.titulo)}</span><span class="ac-aula">${esc(esp.nombre)}</span>`;
    const gente = prog ? (prog.disertantes || []).filter((d) => d && d.nombre) : [];
    const sub = [a.etiqueta, a.quien].filter(Boolean).map(esc).join(' · ');
    return `<details class="ac ac--${a.tipo}">
      <summary>${cab}</summary>
      <div class="ac-det">
        ${sub ? `<p class="ac-sub">${sub}</p>` : ''}
        ${prog && prog.descripcion ? `<p>${esc(prog.descripcion)}</p>` : ''}
        ${gente.length ? `<div class="ac-gente">${gente.map(persona).join('')}</div>` : ''}
      </div>
    </details>`;
  }

  const col = (f) => `<p class="fr-hora"><b>${esc(f.inicio)}</b><span>a ${esc(f.fin)}</span></p>`;

  function pausa(f) {
    return `<section class="fr fr--pausa" id="${idHora(f.inicio)}" data-ini="${min(f.inicio)}" data-fin="${min(f.fin)}" aria-label="${esc(f.inicio)} a ${esc(f.fin)}, ${esc(f.titulo)}">
      <div class="fr-izq">${col(f)}</div>
      <div class="fr-der">
        <h2 class="fr-pausa-t">${esc(f.titulo)}</h2>
        ${f.lugar ? `<p class="fr-lugar">${esc(f.lugar)}</p>` : ''}
        ${f.texto ? `<p class="fr-texto">${texto(f.texto)}</p>` : ''}
        ${f.nota ? `<p class="crono-nota">${esc(f.nota)}</p>` : ''}
      </div>
    </section>`;
  }

  function franja(f, espacios, acts) {
    const prog = (t) => (t ? acts.find((x) => x && x.titulo === t) : null);
    const filas = espacios.map((e) => {
      const a = (f.actividades || []).find((x) => x && x.titulo && x.espacio === e.nombre);
      return a ? fila(a, e, prog(a.programa)) : '';
    }).join('');
    return `<section class="fr" id="${idHora(f.inicio)}" data-ini="${min(f.inicio)}" data-fin="${min(f.fin)}" aria-label="De ${esc(f.inicio)} a ${esc(f.fin)}">
      <div class="fr-izq"><h2 class="sr">De ${esc(f.inicio)} a ${esc(f.fin)}</h2>${col(f)}</div>
      <div class="fr-der">${filas}</div>
    </section>`;
  }

  // ── talleres: cada uno con sus horarios (sale de las franjas)
  function talleres(franjas, espacios) {
    const ts = new Map();
    franjas.forEach((f) => (f.actividades || []).forEach((a) => {
      if (!a || !a.titulo || a.tipo !== 'taller') return;
      const t = ts.get(a.titulo) || { horas: [], espacio: a.espacio };
      t.horas.push(f.inicio);
      ts.set(a.titulo, t);
    }));
    if (!ts.size) return;
    const dobles = [...ts.values()].some((t) => t.horas.length > 1);
    const lugares = new Set([...ts.values()].map((t) => t.espacio));
    const esp = espacios.find((e) => lugares.size === 1 && e.nombre === [...lugares][0]);
    $('#talleresLista').innerHTML = [...ts].map(([t, v]) => `<li>
        <b>${esc(t)}${v.horas.length > 1 ? '*' : ''}</b>
        <span>${v.horas.map(esc).join(' y ')}</span>
      </li>`).join('') + (esp ? `<li class="crono-talleres-donde">Todos en ${esc(esp.nombre)}${esp.piso ? `, ${esc(esp.piso)}` : ''}</li>` : '');
    $('#talleresNota').hidden = !dobles;
    $('#talleres').hidden = false;
  }

  // ── aulas: lista numerada y números sobre el plano
  function aulas(espacios) {
    $('#aulasLista').innerHTML = espacios.map((e, i) => {
      const p = PLANO[e.nombre] || { tinta: 'charla' };
      return `<li><span class="aula-n aula-n--${p.tinta}">${i + 1}</span><b>${esc(e.nombre)}</b><span class="aula-piso">${esc(e.piso || '')}</span></li>`;
    }).join('');
    $('#plano').insertAdjacentHTML('beforeend', espacios.map((e, i) => {
      const p = PLANO[e.nombre];
      return p ? `<span class="plano-pin aula-n--${p.tinta}" style="left:${p.x}%;top:${p.y}%" aria-hidden="true">${i + 1}</span>` : '';
    }).join(''));
  }

  // ── horarios (barra fija): saltar a una franja; marca la que se está viendo
  function barra(franjas) {
    const ul = $('#horasLista');
    ul.innerHTML = franjas.map((f) => `<li><a href="#${idHora(f.inicio)}">${esc(f.inicio)}</a></li>`).join('')
      + `${$('#talleres').hidden ? '' : '<li class="horas-sep"><a href="#talleres">Talleres</a></li>'}<li><a href="#aulas">Aulas</a></li>`;
    const links = [...ul.querySelectorAll('a')];
    const marcar = (id) => links.forEach((l) => {
      const si = l.getAttribute('href') === '#' + id;
      if (si) {
        l.setAttribute('aria-current', 'true');
        const nav = $('#horas');
        const x = l.offsetLeft - (nav.clientWidth - l.offsetWidth) / 2;
        nav.scrollTo({ left: Math.max(0, x), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      } else l.removeAttribute('aria-current');
    });
    // La marcada es la última sección cuyo comienzo ya pasó debajo de la barra.
    const secs = [...document.querySelectorAll('.fr, #talleres:not([hidden]), #aulas')];
    let previa = '', pendiente = false;
    const ver = () => {
      pendiente = false;
      const lim = $('#horas').getBoundingClientRect().bottom + 80;
      let id = secs[0] && secs[0].id;
      secs.forEach((s) => { if (s.getBoundingClientRect().top <= lim) id = s.id; });
      if (id && id !== previa) { previa = id; marcar(id); }
    };
    addEventListener('scroll', () => { if (!pendiente) { pendiente = true; requestAnimationFrame(ver); } }, { passive: true });
    ver();
    return ver;
  }

  // ── ahora: solo el día del evento (hora de Argentina)
  function reloj(fecha) {
    const q = new URLSearchParams(location.search).get('ahora');
    if (q && /^\d{1,2}:\d{2}$/.test(q)) return min(q);
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    if (`${p.year}-${p.month}-${p.day}` !== fecha) return null;
    return Number(p.hour) * 60 + Number(p.minute);
  }

  function marcarAhora(fecha) {
    const m = reloj(fecha);
    const secs = [...document.querySelectorAll('.fr')];
    const fin = secs.length ? Number(secs[secs.length - 1].dataset.fin) : 0;
    const vivo = m !== null && m < fin;
    let actual = null;
    secs.forEach((s) => {
      const ini = Number(s.dataset.ini), f = Number(s.dataset.fin);
      const ahora = vivo && m >= ini && m < f;
      s.classList.toggle('fr--pasada', vivo && m >= f);
      s.classList.toggle('fr--ahora', ahora);
      const tag = $('.fr-tag-ahora', s);
      if (ahora && !tag) $('.fr-izq', s).insertAdjacentHTML('beforeend', '<span class="fr-tag-ahora">Ahora</span>');
      if (!ahora && tag) tag.remove();
      if (ahora) actual = s;
    });
    const link = $('#ahoraLink');
    const proxima = vivo && !actual ? secs.find((s) => Number(s.dataset.ini) > m) : null;
    const destino = actual || proxima;
    if (destino) {
      link.href = '#' + destino.id;
      link.innerHTML = `<b>${actual ? 'Ahora' : 'Empieza'}</b> ${esc(destino.getAttribute('aria-label').replace(/^De /, ''))} <span aria-hidden="true">↓</span>`;
      link.hidden = false;
    } else link.hidden = true;
    return destino;
  }

  // ── carga
  Promise.all([cargar('../assets/data/cronograma.json'), cargar('../assets/data/actividades.json')]).then(([cr, acts]) => {
    const dia = $('#dia');
    if (!cr || !Array.isArray(cr.franjas)) {
      dia.innerHTML = '<p class="crono-cargando">No pudimos cargar el cronograma. Revisá tu conexión y volvé a intentar.</p><button type="button" class="btn btn--navy" onclick="location.reload()">Recargar</button>';
      return;
    }
    const espacios = (cr.espacios || []).filter((e) => e && e.nombre);
    const franjas = cr.franjas.filter((f) => f && f.inicio && f.fin).sort((a, b) => min(a.inicio) - min(b.inicio));
    const lista = Array.isArray(acts) ? acts : [];
    dia.innerHTML = franjas.map((f) => (f.pausa ? pausa(f) : franja(f, espacios, lista))).join('');
    talleres(franjas, espacios);
    aulas(espacios);
    const actualizarBarra = barra(franjas);
    const destino = marcarAhora(cr.fecha);
    setInterval(() => marcarAhora(cr.fecha), 30000);
    // El día del evento, al entrar sin un #, la página va directo a lo que pasa ahora.
    // Se repite al terminar de cargar la página (fuentes e imágenes mueven el alto), salvo que la persona ya se haya movido.
    const ir = destino && !location.hash ? destino : location.hash ? document.getElementById(location.hash.slice(1)) : null;
    if (ir) {
      let movio = false;
      ['wheel', 'touchstart', 'keydown'].forEach((ev) => addEventListener(ev, () => { movio = true; }, { once: true, passive: true }));
      const saltar = () => { if (!movio) ir.scrollIntoView({ block: 'start', behavior: 'instant' }); actualizarBarra(); };
      requestAnimationFrame(saltar);
      if (document.readyState !== 'complete') addEventListener('load', () => requestAnimationFrame(saltar), { once: true });
      if (document.fonts) document.fonts.ready.then(() => requestAnimationFrame(saltar));
    }
  });
})();
