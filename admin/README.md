# Panel de contenido (CMS)

Panel para cargar/editar el **programa (agenda)** y los **disertantes** sin tocar HTML, hecho con [Decap CMS](https://decapcms.org/).

## Uso local (recomendado, sin configuración adicional)

1. En este proyecto, corré en una terminal:
   ```
   npx decap-server
   ```
2. En otra terminal, levantá el sitio:
   ```
   npx serve .
   ```
3. Abrí `http://localhost:3000/admin/` (o el puerto que indique `serve`) y hacé clic en **Login**.
4. Editá agenda o disertantes con los formularios. Al publicar, los cambios se escriben directo en `assets/data/agenda.json` y `assets/data/speakers.json` de tu copia local.
5. Revisá el diff (`git diff`) y pedile a Claude Code (o hacé vos) el commit + push para que se publique en efsarg.com.ar.

Esto funciona solo en `localhost` — es el modo pensado para vos como único editor, trabajando desde tu compu.

## Uso remoto (opcional, editar desde el sitio publicado sin pasar por acá)

Si en algún momento querés poder entrar a `efsarg.com.ar/admin` y editar sin tener el proyecto abierto localmente, hace falta:

1. Crear una **GitHub OAuth App** en github.com/settings/developers, con:
   - Homepage URL: `https://efsarg.com.ar`
   - Authorization callback URL: la que te dé el proxy del paso 2.
2. Deployar un proxy de autenticación (gratis, ej. en Vercel) — hay proyectos listos como [decap-cms-oauth-provider](https://github.com/vencax/netlify-cms-github-oauth-provider) con botón de "Deploy".
3. Cargar `client id`/`client secret` como variables de entorno del proxy.
4. En `admin/config.yml`, agregar `base_url: https://tu-proxy.vercel.app` dentro de `backend:`.

Sin este paso, `efsarg.com.ar/admin` no permite loguearse — es esperado, ya que no hay servidor propio corriendo (el sitio es 100% estático en GitHub Pages).

## Qué NO gestiona este panel (todavía)

Fecha del evento, textos del hero/inscripción, contacto — esos siguen siendo edición directa de `index.html` (son textos únicos, no listas repetidas, así que agregarlos al CMS no reduce riesgo de desincronización).
