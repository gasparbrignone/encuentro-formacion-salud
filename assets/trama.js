/* EFS · trama en el navegador
   Aplica a cualquier foto el tratamiento de imagen de la identidad EFS 2026:
   trama de puntos finos a dos tintas (navy en las sombras, tinta de categoría en los medios tonos)
   y retiro progresivo por tono hacia un lado (la imagen "se abre" hacia el blanco).
   Así las fotos que se suben desde el panel quedan con la identidad sin editarlas a mano.

   Uso: EFSTrama.aplicar(contenedor, urlDeImagen, { tinta: '#2C6FA0', retiro: 'bottom' })
*/
(function () {
  const NAVY = '#16283F';

  function cargar(src) {
    return new Promise((ok, mal) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => ok(im);
      im.onerror = mal;
      im.src = src;
    });
  }

  // Luminancia de la imagen encuadrada como "cover", en una grilla de muestreo (gw × gh).
  function muestrear(im, gw, gh, foco) {
    const c = document.createElement('canvas');
    c.width = gw; c.height = gh;
    const x = c.getContext('2d', { willReadFrequently: true });
    const s = Math.max(gw / im.naturalWidth, gh / im.naturalHeight);
    const w = im.naturalWidth * s, h = im.naturalHeight * s;
    x.fillStyle = '#fff'; x.fillRect(0, 0, gw, gh);
    x.drawImage(im, (gw - w) * foco[0], (gh - h) * foco[1], w, h);
    const d = x.getImageData(0, 0, gw, gh).data;
    const L = new Float32Array(gw * gh);
    for (let i = 0; i < L.length; i++) L[i] = (d[i * 4] * .299 + d[i * 4 + 1] * .587 + d[i * 4 + 2] * .114) / 255;
    // autocontraste (percentiles 1 % / 99 %)
    const ord = Float32Array.from(L).sort();
    const lo = ord[Math.floor(ord.length * .01)], hi = ord[Math.floor(ord.length * .99)] || 1;
    const k = 1 / Math.max(.05, hi - lo);
    for (let i = 0; i < L.length; i++) L[i] = Math.min(1, Math.max(0, (L[i] - lo) * k));
    return L;
  }

  function retiro(x, y, W, H, lado, a, b) {
    let t;
    switch (lado) {
      case 'bottom': t = y / H; break;
      case 'top': t = 1 - y / H; break;
      case 'left': t = 1 - x / W; break;
      case 'right': t = x / W; break;
      case 'bl': t = (y / H + 1 - x / W) / 2; break;
      case 'radial': t = Math.hypot(x / W - .5, (y / H - .45) * H / W) / .55; break;
      default: return 0;
    }
    t = Math.min(1, Math.max(0, (t - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  const soltar = (v, t) => (t >= .99 ? 0 : Math.max(0, (v - t) / (1 - t)));

  function dibujar(canvas, im, o) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(canvas.clientWidth * dpr), H = Math.round(canvas.clientHeight * dpr);
    if (!W || !H) return;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const cel = (o.celda || 5) * dpr;
    // grilla de muestreo: 2 muestras por celda
    const gw = Math.max(8, Math.round(W / cel * 2)), gh = Math.max(8, Math.round(H / cel * 2));
    const L = muestrear(im, gw, gh, o.foco || [.5, .5]);
    const lum = (x, y) => {
      const i = Math.min(gw - 1, Math.max(0, Math.round(x / W * gw - .5)));
      const j = Math.min(gh - 1, Math.max(0, Math.round(y / H * gh - .5)));
      return L[j * gw + i];
    };
    const capa = (color, ang, valor) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      const a = ang * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), R = Math.hypot(W, H) / 2;
      for (let v = -R; v <= R; v += cel) for (let u = -R; u <= R; u += cel) {
        const x = W / 2 + u * c - v * s, y = H / 2 + u * s + v * c;
        if (x < -cel || y < -cel || x > W + cel || y > H + cel) continue;
        const k = valor(1 - lum(x, y), retiro(x, y, W, H, o.retiro, o.desde ?? .45, o.hasta ?? 1));
        if (k < .035) continue;
        const r = Math.sqrt(k) * cel * .62;
        ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    };
    const g = o.gamma || 1, dk = o.umbral ?? .32;
    // medios tonos en la tinta de categoría (15°), sombras en navy (45°)
    if (o.tinta) capa(o.tinta, 15, (d, t) => soltar(Math.max(0, 1 - Math.abs(Math.pow(d, g) - .4) / .38) * .7, t));
    capa(o.sombra || NAVY, 45, (d, t) => soltar(Math.max(0, (Math.pow(d, g) - dk) / (1 - dk)), t));
  }

  async function aplicar(cont, src, o = {}) {
    if (!cont || !src) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'trama-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    cont.appendChild(canvas);
    try {
      const im = await cargar(src);
      const pintar = () => { try { dibujar(canvas, im, o); } catch (e) { fallback(); } };
      const fallback = () => { canvas.remove(); const i = document.createElement('img'); i.src = src; i.alt = ''; i.className = 'trama-fallback'; cont.appendChild(i); };
      pintar();
      let t;
      new ResizeObserver(() => { clearTimeout(t); t = setTimeout(pintar, 120); }).observe(cont);
    } catch (e) {
      canvas.remove();
    }
  }

  window.EFSTrama = { aplicar };
})();
