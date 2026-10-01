# Sitio del EFS: instructivo

Sitio: **efsarg.com.ar** · Repositorio: `gasparbrignone/encuentro-formacion-salud` · Se publica con GitHub Pages desde la rama `main`.

Todo el contenido que cambia (fecha, inscripción, programa, disertantes, fotos) se edita desde un panel web gratuito, **Pages CMS**, sin tocar código. Cada cambio guardado en el panel se publica solo en 1 o 2 minutos.

---

## Tareas pendientes

Marcá cada una cuando la hagas.

- [ ] **1. Revisar el rediseño.** Está en la rama `rediseno-2026`, todavía no publicado. Las capturas están en `Diseño EFS/design-work/web-capturas/` (computadora, celular, programa con contenido, detalle de una actividad e inscripción abierta).
- [ ] **2. Publicarlo.** Ver [Publicar el rediseño](#publicar-el-rediseño). Hasta que lo publiques, el sitio sigue mostrando la versión anterior, con el programa de la 1.ª edición.
- [ ] **3. Activar el panel (Pages CMS).** Ver [Activar el panel](#activar-el-panel-una-sola-vez). Lleva unos 5 minutos y se hace una sola vez.
- [ ] **4. Revisar los textos fijos.** Confirmá que sigan valiendo "Entrada libre y gratuita" y "Certificado de la UNR" para la 2.ª edición, y que el teléfono y el WhatsApp de contacto sean los correctos (se editan desde el panel, en *Evento*).
- [ ] **5. Confirmar la fecha de la 1.ª edición.** En la sección "Así fue la 1.ª edición" dice *Sábado 11 de abril de 2026*; lo tomé del posteo de "Cambio de fecha". Se corrige en el panel, en *Edición anterior*.
- [ ] **6. Cuando haya fecha:** cargarla en *Evento → Fecha* y *Horario general*. Avisame para actualizar la imagen que se ve al compartir el link, que hoy no muestra fecha.
- [ ] **7. Cuando abra la inscripción:** en *Evento → Inscripción*, elegir *Abierta* y pegar el link del formulario.
- [ ] **8. Cargar las actividades de la 2.ª edición** (con fotos). Ver [Cargar una actividad](#cargar-una-actividad).

---

## Publicar el rediseño

**Opción A, desde GitHub (sin instalar nada):**
1. Entrá a `github.com/gasparbrignone/encuentro-formacion-salud`.
2. Va a aparecer un aviso amarillo con la rama `rediseno-2026` y el botón **Compare & pull request**. Hacé clic.
3. Tocá **Create pull request** y después **Merge pull request** → **Confirm merge**.
4. En 1 o 2 minutos efsarg.com.ar muestra el sitio nuevo. Si no lo ves, recargá con Ctrl + F5.

**Opción B:** pedímelo en Claude Code ("publicá el rediseño del sitio") y lo hago yo.

Si algo sale mal, en GitHub se puede volver atrás con el botón **Revert** del pull request.

---

## Activar el panel (una sola vez)

1. Entrá a **https://app.pagescms.org** y tocá **Sign in with GitHub**. Usá la cuenta que tiene acceso al repositorio.
2. Te va a pedir **instalar la GitHub App de Pages CMS**. Instalala y, cuando pregunte a qué repositorios darle acceso, elegí solo `encuentro-formacion-salud`.
3. Abrí el repositorio en Pages CMS y elegí la rama **`main`**. Hacelo después de publicar el rediseño, porque la configuración del panel (`.pages.yml`) llega a `main` con él.
4. A la izquierda vas a ver tres secciones:
   - **Evento (fecha, inscripción, contacto)**
   - **Programa (charlas y talleres)**
   - **Edición anterior (1.ª edición)**

Es gratis. Para que otra persona del equipo edite, esa persona necesita acceso al repositorio en GitHub (Settings → Collaborators), o se la puede invitar desde Pages CMS.

---

## Cargar una actividad

En **Programa (charlas y talleres)** → **Add an entry** (agregar) y completá:

| Campo | Qué poner | Ejemplo |
|---|---|---|
| Título | El nombre de la charla o taller | Síndrome coronario agudo |
| Tipo | Charla, Charla-taller, Taller, Capacitación o Especial | Charla |
| Área temática | Opcional. Aparece junto al tipo | Cardiología |
| Hora de inicio | Formato 24 h, **con dos dígitos** | 09:00 |
| Hora de fin | Opcional | 10:30 |
| Lugar | Aula o anfiteatro | Anfiteatro A |
| Descripción | Dos o tres líneas | Reconocimiento clínico, ECG y manejo inicial… |
| Temas | Opcional. Palabras clave, una por línea | Reconocimiento / Manejo inicial |
| Imagen | Opcional. Foto o lámina del tema | (subir archivo) |
| Disertantes | Uno o más: nombre, rol, institución y foto opcional | Florencia Pérez · Médica cardióloga · UNR |
| Cupo | Solo si tiene cupo | 30 |
| Requiere inscripción previa | Tildalo para talleres con cupo | ✓ |
| Ocultar esta actividad | Tildalo para guardarla como borrador sin mostrarla | |

Tocá **Save**. En 1 o 2 minutos aparece en el sitio.

**Cómo se ve:**
- Las actividades se agrupan y ordenan por hora de inicio.
- Charla y Charla-taller van en azul; Taller y Capacitación, en teal.
- **Especial** sirve para acreditación, almuerzo o cierre: se muestra como una línea simple, sin tarjeta.
- Los **disertantes** se arman solos a partir de las actividades. Si una persona da dos charlas, cargala con el mismo nombre en las dos y aparece una sola vez.
- Con dos o más actividades, aparecen los filtros "Charlas / Talleres".

### Fotos
- El sitio les aplica **solo** la trama de puntos EFS (azul o teal según el tipo). No hace falta editarlas.
- Mejor fotos sin texto encima, de al menos 1000 px de ancho y de menos de 2 MB.
- Para los disertantes, una foto de frente con fondo simple.
- Usá fotos propias, con permiso, o de dominio público.

---

## Otras tareas frecuentes

- **Cambiar la fecha:** *Evento → Fecha* (ej.: "Sábado 17 de octubre") y *Horario general* (ej.: "de 9 a 18 h").
- **Abrir la inscripción:** *Evento → Inscripción → Estado: Abierta* y pegar el *Link al formulario*. El botón "Inscribirme" y los pasos aparecen solos.
- **Cerrar la inscripción:** *Estado: Cerrada*.
- **Ocultar la sección de la edición anterior:** *Evento* → destildar "Mostrar la sección…".
- **Fotos de "Así fue la 1.ª edición":** *Edición anterior → Fotos de la jornada*. Se ven como galería, antes de la lista de actividades. La primera foto sale más grande y la segunda alta, así que conviene elegirlas en ese orden.
- **Kit de bienvenida:** la sección "¿Qué te llevás del EFS?" toma el precio de *Evento → Inscripción → Precio*. Si el precio es 0, la sección se oculta sola (no se promete kit en una entrada gratuita).

## Ver cómo queda con contenido

Agregando **`?demo`** a la dirección (**efsarg.com.ar/?demo**) el sitio muestra el programa de la 1.ª edición con fotos, como ejemplo. No afecta lo que ve el público.

## Qué no se edita desde el panel

Los textos fijos del diseño ("Estamos armando el programa", los títulos de sección), la foto de la fachada del inicio y las imágenes y la animación del kit de bienvenida. Para cambiarlos, pedímelo en Claude Code.

## Si algo se rompe

Cada cambio del panel es un commit en GitHub. Para deshacer uno: en GitHub → **Commits** → abrí el commit → **Revert**, o pedímelo en Claude Code.

---

## Archivos (referencia técnica)

| Archivo | Qué es |
|---|---|
| `index.html` | Estructura de la página |
| `assets/styles.css` | Estilos (sistema visual EFS 2026: Chivo, blanco + navy + color de categoría, franja lateral) |
| `assets/script.js` | Carga los datos y arma el programa, los disertantes y la inscripción |
| `assets/trama.js` | Aplica la trama de puntos a las fotos en el navegador |
| `assets/data/evento.json` | Fecha, inscripción, contacto |
| `assets/data/actividades.json` | Programa de la edición actual (hoy vacío) |
| `assets/data/archivo/edicion-1.json` | Programa de la 1.ª edición |
| `assets/img/uploads/` | Fotos subidas desde el panel |
| `.pages.yml` | Configuración del panel (Pages CMS) |

**Créditos de imágenes:**
- Fachada de la FCM: foto de Luis H. Vaca, CC BY-SA 4.0 (Wikimedia Commons), tratada en trama.
- Corazón: *Gray's Anatomy*, 1918, dominio público.
- Radiografía de tórax: Mikael Häggström, CC0.
- Práctica de RCP: U.S. Army, dominio público.
