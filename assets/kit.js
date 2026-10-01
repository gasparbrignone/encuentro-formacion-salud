/* EFS · escena 3D del kit de bienvenida.
   Con JS la escena arranca "cerrada" (los objetos hundidos en la bolsa) y se abre sola al entrar en pantalla.
   Después gira un poco con el mouse, con la inclinación del celular o con el scroll (no hay animación infinita que corra sola). Con "reducir movimiento" (ajuste del sistema) solo hace un fundido corto,
   sin giro. Sin JS se ve la escena abierta, quieta. */
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
    if (!quieto) setTimeout(() => { escena.classList.add('kit--viva'); girar(); }, 1400);
  }

  new IntersectionObserver((es, ob) => {
    if (es.some((e) => e.isIntersecting)) { ob.disconnect(); abrir(); }
  }, { threshold: 0.3 }).observe(escena);

  // giro 3D: el mouse inclina la escena; en el celular la inclina el movimiento del aparato (giroscopio) y, si no hay sensor o permiso, el scroll
  let rx = 0, ry = 0, tx = 0, ty = 0, px = null, py = null, vivo = false;
  let og = null, ob = null, sg = 0, sb = 0, sensor = false;   // inclinación del aparato: lectura de referencia (og, ob) y desvío actual en grados
  const tope = (v, m) => Math.max(-m, Math.min(m, v));
  function inclinacion(e) {
    if (e.gamma == null || e.beta == null) return;
    if (og === null) { og = e.gamma; ob = e.beta; }
    // la referencia se acomoda sola a como se sostiene el celular, así que importa el cambio y no la posición absoluta
    og += (e.gamma - og) * 0.02; ob += (e.beta - ob) * 0.02;
    sg = tope(e.gamma - og, 30); sb = tope(e.beta - ob, 30);
    sensor = true;
  }
  function escucharInclinacion() { window.addEventListener("deviceorientation", inclinacion, { passive: true }); }
  if (typeof DeviceOrientationEvent !== "undefined" && matchMedia("(pointer: coarse)").matches) {
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      // iOS: el permiso se pide con un toque sobre la escena
      escena.addEventListener("click", function pedir() {
        escena.removeEventListener("click", pedir);
        DeviceOrientationEvent.requestPermission().then((r) => { if (r === "granted") escucharInclinacion(); }).catch(() => {});
      });
    } else escucharInclinacion();
  }
  window.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { px = e.clientX / innerWidth; py = e.clientY / innerHeight; } }, { passive: true });
  function girar() {
    if (vivo) return; vivo = true;
    (function paso() {
      const r = escena.getBoundingClientRect();
      if (r.bottom > 0 && r.top < innerHeight) {
        const avance = (innerHeight - r.top) / (innerHeight + r.height);        // 0 al entrar, 1 al salir
        if (sensor && px === null) { ty = sg * 0.5; tx = 3 - sb * 0.4; }
        else {
          ty = px === null ? (avance - 0.5) * -12 : (px - 0.5) * 24;
          tx = px === null ? 3 : (py - 0.5) * -14;
        }
        rx += (tx - rx) * 0.08; ry += (ty - ry) * 0.08;
        mundo.style.setProperty('--rx', rx.toFixed(2) + 'deg');
        mundo.style.setProperty('--ry', ry.toFixed(2) + 'deg');
      }
      requestAnimationFrame(paso);
    })();
  }
})();
