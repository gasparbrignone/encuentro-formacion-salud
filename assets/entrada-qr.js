/* EFS · dibuja el QR de una entrada en el navegador (sin servicios externos).
   Usa assets/vendor/qrcode.js (Kazuhiko Arase, licencia MIT), que tiene que cargarse antes.
   window.EFSQR.dibujar(contenedor, codigo, linkGuardar?) */
(function () {
  const VALIDO = /^EFS26-[0-9A-HJKMNP-TV-Z]{8}$/;

  function crear(codigo) {
    // Modo alfanumérico + corrección M: 14 caracteres entran en un QR versión 1 (21×21), el más rápido de leer.
    const qr = window.qrcode(0, 'M');
    qr.addData(codigo, 'Alphanumeric');
    qr.make();
    return qr;
  }

  function dibujar(contenedor, codigo, linkGuardar) {
    if (!contenedor || !VALIDO.test(codigo) || !window.qrcode) return false;
    const qr = crear(codigo);
    contenedor.innerHTML = qr.createSvgTag({ cellSize: 10, margin: 3, scalable: true });
    const svg = contenedor.querySelector('svg');
    if (svg) { svg.setAttribute('aria-hidden', 'true'); svg.removeAttribute('width'); svg.removeAttribute('height'); }
    if (linkGuardar) linkGuardar.href = qr.createDataURL(12, 4);
    return true;
  }

  window.EFSQR = { dibujar, valido: (c) => VALIDO.test(c) };
})();
