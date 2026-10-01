/* EFS · escena 3D del kit de bienvenida.
   Con JS la escena arranca "cerrada" (los objetos hundidos en la bolsa) y se abre sola al entrar en pantalla.
   Después flota despacio y gira un poco con el mouse o con el scroll. Con "reducir movimiento" (ajuste del sistema) solo hace un fundido corto,
   sin giro ni flote. Sin JS se ve la escena abierta, quieta. */
(function () {
  const escena = document.getElementById('kitEscena');
  const mundo = document.getElementById('kitMundo');
  if (!escena || !mundo) return;
  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!('IntersectionObserver' in window)) return;

  escena.classList.add('kit--prep');
  if (quieto) escena.classList.add('kit--suave');
  const imgs = [...escena.querySelectorAll('img')];
  let abierta = false;

  async function abrir() {
    if (abierta) return;
    abierta = true;
    // esperar a que estén las imágenes (cargan en diferido) para no animar una escena vacía
    await Promise.race([Promise.all(imgs.map((i) => i.decode().catch(() => {}))), new Promise((ok) => setTimeout(ok, 2500))]);
    escena.classList.remove('kit--prep');
    escena.classList.add('kit--abierto');
    if (!quieto) setTimeout(() => { escena.classList.add('kit--viva'); girar(); }, 2600);
  }

  new IntersectionObserver((es, ob) => {
    if (es.some((e) => e.isIntersecting)) { ob.disconnect(); abrir(); }
  }, { threshold: 0.3 }).observe(escena);

  // giro 3D: el mouse inclina la escena; sin mouse (celular) la inclina el scroll
  let rx = 0, ry = 0, tx = 0, ty = 0, px = null, py = null, vivo = false;
  window.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { px = e.clientX / innerWidth; py = e.clientY / innerHeight; } }, { passive: true });
  function girar() {
    if (vivo) return; vivo = true;
    (function paso() {
      const r = escena.getBoundingClientRect();
      if (r.bottom > 0 && r.top < innerHeight) {
        const avance = (innerHeight - r.top) / (innerHeight + r.height);        // 0 al entrar, 1 al salir
        ty = px === null ? (avance - 0.5) * -20 : (px - 0.5) * 24;
        tx = px === null ? 3 : (py - 0.5) * -14;
        rx += (tx - rx) * 0.08; ry += (ty - ry) * 0.08;
        mundo.style.setProperty('--rx', rx.toFixed(2) + 'deg');
        mundo.style.setProperty('--ry', ry.toFixed(2) + 'deg');
      }
      requestAnimationFrame(paso);
    })();
  }
})();
