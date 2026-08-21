# Qué arreglé yo vs. qué necesita que hagas tú — 20 de agosto 2026

## ✅ Ya lo arreglé (va en el zip que te mando)

1. **Backfill de pulgadas completado.** Las 8 obras que solo tenían cm ya tienen también su medida en pulgadas — lo hice directo en Sanity (publicado, no quedó en borrador), no necesitas subir nada para esto.
2. **"Powered by Square" → "Powered by Stripe"** en `shop.html` y `artwork.html` (dos lugares: el info-strip del shop y el acordeón "Payment options" de la página de obra).
3. **El acordeón "Shipping and taxes" de `artwork.html` ahora dice de dónde sale la pieza según el artista** (México / Estados Unidos / Europa / Salt Lake City), en vez de decir siempre "from Salt Lake City, UT".
4. **El checkout de Stripe ya no dice siempre "Domestic Shipping (US)".** Ahora la etiqueta refleja el país real de origen del artista (`Domestic Shipping (Mexico)`, `Domestic Shipping (US)`, etc). Ojo: las **tarifas** (montos en dólares) siguen calculándose solo por tamaño de la obra, igual que antes — si en algún momento quieres tarifas distintas según si sale de México/USA/Europa, dime los montos y lo ajusto.
5. **Nuevo sitemap dinámico** (`/api/sitemap.js` + un rewrite en `vercel.json` que apunta `/sitemap.xml` → `/api/sitemap`, y borré el `sitemap.xml` estático viejo). Ahora el sitemap incluye las ~90 páginas de obra individuales además de las 10 páginas fijas del sitio — debería ayudar a que Google las indexe.
6. **La imagen que se ve al compartir la portada en redes (og:image)** ahora apunta a `og-shop.jpg`, que ya vive en tu propio dominio, en vez de a una URL externa de Webflow.

## 🔴 Esto solo lo puedes hacer tú (accesos que no tengo desde aquí)

### 1. Regenerar el token de escritura de Sanity — urgente
Es el hallazgo más importante de la auditoría: `/api/weekly-digest` falló con `401 — "Session does not match project host"` al intentar usar `SANITY_WRITE_TOKEN`. Esa misma variable la usan `webhook.js` (marcar obra vendida) e `inquiry.js` (guardar mensajes de contacto), así que si el token está roto, esas dos cosas también podrían estar fallando en silencio ahora mismo.

Pasos:
1. Ve a **manage.sanity.io** → tu proyecto (`vocdg9am`) → **API** → **Tokens**.
2. Si ves un token viejo que ya no reconoces o que se ve como copiado de una sesión del navegador, bórralo.
3. Click **Add API token** → nombre algo como `vercel-write` → permisos **Editor** (necesita poder escribir, no solo leer) → crear.
4. Copia el token (solo se muestra una vez).
5. Ve a **Vercel** → tu proyecto `mixi-art-studio` → **Settings** → **Environment Variables** → busca `SANITY_WRITE_TOKEN` → edítala y pega el token nuevo → guarda (aplica a Production).
6. Vercel te va a pedir hacer un nuevo deploy para que tome el cambio — puede ser con el próximo push, o desde el botón "Redeploy" en el dashboard.
7. **Prueba real:** manda un mensaje de prueba desde el formulario de contacto del sitio y confirma que aparece como `inquiry` en Sanity Studio. Si quieres, avísame y yo lo reviso desde aquí también.

### 2. Configurar `CRON_SECRET` en Vercel
Esto evita que cualquiera pueda disparar `/api/weekly-digest` públicamente sin autorización.

1. Vercel → `mixi-art-studio` → **Settings** → **Environment Variables** → **Add New**.
2. Nombre: `CRON_SECRET`
3. Valor (ya generado, cópialo tal cual):
   ```
   86dc50b6d09740172c7decf6743b30a3c8f689861778dc33
   ```
4. Aplica a **Production** → guarda → redeploy.

Vercel Cron añade automáticamente el header de autorización correcto cuando dispara el cron — no tienes que hacer nada más para que el cron semanal siga funcionando, esto solo bloquea a quien no sea Vercel.

### 3. Confirmar que `RESEND_API_KEY` esté configurada
No hay forma de verlo desde aquí — si falta, los correos simplemente no se envían y no aparece ningún error en los logs. Ve a Vercel → Environment Variables y confírmame si `RESEND_API_KEY` está ahí. Si no está: Resend → API Keys → crea una → pégala en Vercel.

## 🟢 Necesito un dato tuyo (no es técnico, es de negocio)

- **3 obras marcadas "sold" sin precio guardado**: *PICTRIX CELEBRIS*, *"A veces las cosas no salen como estaban planeadas..."* y *Jabberwacky*. ¿Fueron ventas privadas/regalos, o simplemente faltó cargar el precio? Si me dices el monto te lo cargo en Sanity.
- **Sebastián Dávila** sigue con `basedIn: "Not provided"` — el sistema usa su nacionalidad (México) como respaldo, así que no rompe nada, pero si me dices dónde vive/trabaja hoy lo actualizo.

## 🔵 Encontrado pero fuera del alcance de un arreglo rápido (para que lo tengas en el radar)

Mientras revisaba el tema del og:image, noté que **todo el sitio depende de la CDN de tu Webflow viejo** (`cdn.prod.website-files.com`) para las fuentes tipográficas (los `.otf`), el logo, y varias imágenes de fondo — no solo la imagen que ya corregí. Hoy funciona porque esa CDN sigue viva, pero es una dependencia externa que no controlas: si algún día cierras o cambias esa cuenta de Webflow, esos assets dejarían de cargar en tu sitio. No lo toqué porque implica descargar cada archivo (fuentes, logo, imágenes) y volver a subirlos a tu propio repo en varias páginas — es un trabajo más grande. Dime si quieres que lo hagamos como proyecto aparte.
