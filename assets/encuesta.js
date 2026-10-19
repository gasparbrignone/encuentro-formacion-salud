/* Encuesta anónima del EFS 2026 (efsarg.com.ar/encuesta/).
   - Desde el mail llega con ?n=1..5: la nota se registra sola (un toque) y después se completan los textos.
   - Anónima: el mismo link para todos; la respuesta se identifica con un id al azar que arma este navegador
     (para poder completar la nota después). No se manda nombre, correo ni nada de la persona. */
(function () {
  'use strict';
  var SERVICIO = 'https://efs-worker.gasparbrignone1.workers.dev';
  var CLAVE_ID = 'efs-encuesta-id';
  var $ = function (s) { return document.querySelector(s); };

  function idAzar() {
    var b = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(b);
    var s = '';
    for (var i = 0; i < b.length; i++) s += ('0' + b[i].toString(16)).slice(-2);
    return s; // 24 caracteres hex
  }
  var id;
  try { id = localStorage.getItem(CLAVE_ID); } catch (e) { id = null; }
  if (!/^[0-9a-z]{16,32}$/.test(id || '')) {
    id = idAzar();
    try { localStorage.setItem(CLAVE_ID, id); } catch (e) { /* sin almacenamiento: vale igual para esta visita */ }
  }

  var nota = 0;
  var notaEnviada = 0;
  var botones = document.querySelectorAll('.enc-n');
  var estado = $('#encNotaEstado'), error = $('#encError'), boton = $('#encEnviar');

  function enviar(cuerpo) {
    cuerpo.id = id;
    return fetch(SERVICIO + '/encuesta', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
    }).then(function (r) { return r.json(); }).then(function (r) {
      if (!r || r.ok !== true) throw new Error((r && r.error) || 'servicio');
      return r;
    });
  }

  function marcar(n) {
    nota = n;
    botones.forEach(function (b) {
      var on = Number(b.dataset.nota) === n;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.classList.toggle('enc-n--on', on);
    });
  }

  function guardarNota(n) {
    estado.textContent = 'Guardando tu nota...';
    return enviar({ nota: n }).then(function () {
      notaEnviada = n;
      estado.textContent = 'Nota registrada. Gracias.';
    }).catch(function () {
      estado.textContent = 'No pudimos guardar la nota. Se manda con tus respuestas.';
    });
  }

  botones.forEach(function (b) {
    b.addEventListener('click', function () {
      var n = Number(b.dataset.nota);
      marcar(n);
      guardarNota(n);
    });
  });

  // Desde el mail: ?n=4. Se espera un instante y que la pestaña esté a la vista, para que un
  // antivirus o previsualizador de links que abra la página sin una persona no sume notas falsas.
  var n0 = Number((location.search.match(/[?&]n=([1-5])(?:&|$)/) || [])[1]);
  if (n0) {
    marcar(n0);
    var intentar = function () {
      if (document.visibilityState !== 'visible') return document.addEventListener('visibilitychange', intentar, { once: true });
      setTimeout(function () { if (!notaEnviada && nota === n0) guardarNota(n0); }, 1200);
    };
    intentar();
  }

  $('#encuestaForm').addEventListener('submit', function (e) {
    e.preventDefault();
    error.textContent = '';
    var cuerpo = {};
    if (nota) cuerpo.nota = nota;
    ['gusto', 'mejorar', 'proxima'].forEach(function (k) {
      var v = e.target[k].value.trim();
      if (v) cuerpo[k] = v;
    });
    if (!Object.keys(cuerpo).length) { error.textContent = 'Elegí una nota o escribí algo antes de enviar.'; return; }
    boton.disabled = true;
    boton.textContent = 'Enviando...';
    enviar(cuerpo).then(function () {
      $('#encuestaForm').hidden = true;
      $('#encGracias').hidden = false;
      window.scrollTo(0, 0);
    }).catch(function () {
      error.textContent = 'No pudimos enviar tus respuestas. Revisá la conexión y probá de nuevo.';
      boton.disabled = false;
      boton.textContent = 'Enviar mis respuestas';
    });
  });
})();
