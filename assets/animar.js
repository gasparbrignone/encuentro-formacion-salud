/* EFS · animaciones de entrada al hacer scroll, barra de progreso.
   Solo transform y opacity. Si JS falla o el usuario pide menos movimiento, todo se ve normal. */
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const raiz = document.documentElement;
  raiz.classList.add('anim');

  const OBJETIVOS = [
    '.seccion-cab > *', '.filtros', '.act', '.bloque', '.datos--lista > div', '.llegar', '.anterior-intro',
    '.galeria-foto', '#inscripcionCont > *', '.kit-texto', '.vacio', '.disertante', '.expositor-card'
  ].join(',');

  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => {
    es.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('rv-ok');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: .08 }) : null;

  function preparar(raizNodo) {
    if (!io) return;
    const nodos = raizNodo.matches && raizNodo.matches(OBJETIVOS) ? [raizNodo] : [];
    raizNodo.querySelectorAll && nodos.push(...raizNodo.querySelectorAll(OBJETIVOS));
    nodos.forEach((n) => {
      if (n.dataset.rv || n.closest('.kit-escena, nav')) return;
      n.dataset.rv = '1';
      const hermanos = n.parentElement ? [...n.parentElement.children].filter((h) => h.dataset.rv) : [];
      n.style.setProperty('--rv-i', Math.min(Math.max(hermanos.indexOf(n), 0), 6));
      const r = n.getBoundingClientRect();
      if (r.top < innerHeight * .92 && r.bottom > 0) { n.classList.add('rv-ok'); return; }
      n.classList.add('rv');
      io.observe(n);
    });
  }
  preparar(document.body);
  // contenido que llega después (programa, formulario, edición anterior)
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n.nodeType === 1 && preparar(n))))
    .observe(document.querySelector('main') || document.body, { childList: true, subtree: true });

  // separadores: la franja de foto se destapa al entrar
  document.querySelectorAll('.separador').forEach((s) => {
    if (!io) return;
    s.classList.add('rv-sep');
    io.observe(s);
  });

  // barra de progreso de lectura
  const nav = document.getElementById('nav');
  const barra = document.createElement('div');
  barra.className = 'progreso';
  barra.setAttribute('aria-hidden', 'true');
  nav && nav.appendChild(barra);
  let pend = false;
  function medir() {
    pend = false;
    const max = raiz.scrollHeight - innerHeight;
    barra.style.transform = `scaleX(${max > 0 ? Math.min(scrollY / max, 1) : 0})`;
  }
  addEventListener('scroll', () => { if (!pend) { pend = true; requestAnimationFrame(medir); } }, { passive: true });
  medir();
})();
