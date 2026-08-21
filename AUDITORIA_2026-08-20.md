# Auditoría Mixi Art Studio — 20 de agosto 2026

Revisión de Vercel, GitHub (vía metadata de deploys) y el sitio en vivo (mixiartstudio.us). Ordenado por prioridad.

---

## 🔴 Urgente

**1. El token de escritura de Sanity (`SANITY_WRITE_TOKEN`) parece inválido.**
Al probar el endpoint `/api/weekly-digest` en producción, Sanity respondió `401 — "Session does not match project host"`. Ese error típicamente aparece cuando el valor guardado no es un API token real (Manage → API → Tokens) sino algo como un token de sesión copiado del navegador — no funciona para llamadas servidor-a-servidor.

El problema es que **`api/webhook.js`** (marcar obra como vendida + registrar la venta) y **`api/inquiry.js`** (guardar mensajes del formulario de contacto) usan exactamente esa misma variable. Si el token está roto, es posible que ahora mismo una compra se cobre bien en Stripe pero la obra **no** se marque como vendida en Sanity, o que un inquiry del formulario de contacto no se esté guardando.

No he probado `webhook.js`/`inquiry.js` directamente para no crear una venta o inquiry falsos, pero corren el mismo código y usan el mismo token, así que hay riesgo real. Recomiendo: ve a manage.sanity.io → tu proyecto → API → Tokens, genera un token nuevo con permiso de escritura (Editor), y actualízalo en Vercel → Settings → Environment Variables → `SANITY_WRITE_TOKEN`. Después, prueba enviando un inquiry real desde el sitio y confirma que aparece en Sanity Studio.

**2. El cron `/api/weekly-digest` no parece estar protegido.**
Al llamarlo sin ningún header de autorización, no devolvió `401 Unauthorized` (que es lo que pasaría si `CRON_SECRET` estuviera configurado) sino que intentó ejecutarse de verdad y falló por el problema del token de arriba. Eso sugiere que `CRON_SECRET` no está configurado en Vercel, y que cualquiera que conozca la URL podría disparar este endpoint públicamente. Es de bajo riesgo (en el peor caso, dispara el envío de un resumen semanal extra a info@), pero vale la pena configurar `CRON_SECRET` como variable de entorno en Vercel para cerrarlo del todo.

---

## 🟡 Bugs visibles para el cliente

**3. El sitio dice "Powered by Square" pero el procesador real es Stripe.**
En `shop.html` (línea 316): *"Powered by Square. SSL encrypted payments on every transaction."* En `artwork.html` (línea 328): *"Secure checkout via **Square**. Split into 4 interest-free installments with Klarna or Afterpay..."* Todo el backend (`checkout.js`, `webhook.js`) usa Stripe, no Square — es texto desactualizado, probablemente de una versión anterior del sitio. Fácil de corregir: cambiar "Square" por "Stripe" en esos dos archivos.

---

## 🟠 Brecha funcional (relacionada al cambio de origen de envío)

**4. El checkout de Stripe todavía muestra "Domestic Shipping (US)" / "International Shipping" fijos.**
Ya arreglamos que los **correos** de confirmación reflejen el origen real (México/USA/Europa) según el artista. Pero `api/checkout.js` sigue sin usar esa lógica: las opciones de envío que ve el comprador en el checkout de Stripe (y sus tarifas, `SHIPPING_RATES`) siguen calculándose solo por tamaño de la obra, asumiendo que todo sale de EE. UU. Por ejemplo, alguien en México comprando una pieza que en teoría también sale de México vería "International Shipping" en vez de una opción doméstica más barata y precisa. Si quieres, puedo extender `checkout.js` para usar `origin.js` y mostrar tarifas/etiquetas correctas según el artista — es un cambio de tamaño moderado.

---

## 🟢 Datos en Sanity

**5. 8 obras todavía sólo tienen medidas en cm, sin su versión en pulgadas.**
El backfill que pediste quedó casi completo: 0 obras se quedaron solo en pulgadas sin cm, pero 8 obras se quedaron solo en cm sin pulgadas. Puedo terminarlas — dime si quieres que las identifique y las complete ahora.

**6. 3 obras marcadas "sold" no tienen precio guardado** (`price: null`, `priceOnRequest: false`): *PICTRIX CELEBRIS*, *A veces las cosas no salen como estaban planeadas...* y *Jabberwacky*. Puede ser intencional (venta privada/regalo), pero vale la pena revisarlo para tus registros internos.

**7. Sebastián Dávila sigue con `basedIn: "Not provided"`.** El sistema usa su nacionalidad (mexicana) como respaldo para el origen de envío, así que no rompe nada, pero si me pasas dónde vive/trabaja actualmente lo puedo completar.

---

## 🔵 SEO / pulido

**8. El sitemap.xml solo lista las 10 páginas estáticas del sitio** (home, shop, artists, etc.) — no incluye las páginas individuales de cada una de las 91 obras ni de cada artista, así que Google podría no estar indexando esas páginas de forma óptima. Se podría generar un sitemap dinámico (`/api/sitemap.xml`) que incluya cada obra y artista publicados.

**9. La imagen Open Graph de la portada (la que se ve al compartir el link en redes/WhatsApp) apunta a una URL externa** de `cdn.prod.website-files.com` — parece un remanente de una versión anterior del sitio hecha en Webflow. Sería mejor alojar esa imagen en tu propio dominio.

---

## ✅ Lo que está bien (confirmado en esta revisión)

- El bug de obras duplicadas en el shop está **resuelto y confirmado en vivo**: `/api/artworks` devuelve 91 obras reales (87 disponibles, 3 vendidas), sin duplicados.
- El último deploy en Vercel está `READY`, con build limpio — solo una advertencia benigna sobre el rango de versión de Node en `package.json` (`"engines": ">=18.x"`, hoy corriendo en Node 24.x). Podrías fijarlo a `"22.x"` o `"24.x"` para evitar upgrades automáticos sorpresa, pero no es urgente.
- La protección SSO de Vercel está bien configurada: solo las URLs de preview (`*.vercel.app`) piden login, tu dominio público `mixiartstudio.us` está completamente accesible.
- `robots.txt` está bien: permite todo y referencia el sitemap correctamente.
- No encontré errores nuevos recurrentes en producción — el único cluster de error histórico ("Missing Sanity env vars") es de un deploy viejo ya superado.

---

## ❓ Necesito que me confirmes (no lo puedo ver desde aquí)

- **¿`RESEND_API_KEY` está configurada en Vercel?** Si falta, los correos simplemente no se envían — no genera ningún error visible en los logs, solo un `console.warn` silencioso. Vale la pena que hagas una compra o inquiry de prueba y confirmes que te llega el correo.
- El plan de Vercel parece ser Hobby (la retención de logs es de ~1 hora), lo que limita cuánto puedo investigar hacia atrás si algo falla. Si quieres visibilidad histórica real, Pro te da 1 día de retención.
- No hay forma de confirmar desde aquí si el cron semanal ya se disparó alguna vez — si quieres, dime y lo revisamos juntos la próxima vez que corra (lunes).

---

*Nota: no tengo acceso directo a GitHub (push/API) ni a la consola de Vercel — todo esto lo vi a través de las herramientas conectadas a este chat (Vercel, Sanity, y el sitio público). Los archivos que necesiten cambios te los mando en un zip, como siempre, para que los subas a GitHub.*
