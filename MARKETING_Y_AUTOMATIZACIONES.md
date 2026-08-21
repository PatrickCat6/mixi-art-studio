# Automatizaciones y marketing — 20 de agosto 2026

## ✅ Ya construido y listo (va en el zip)

1. **Confirmación automática al cliente cuando manda un inquiry.** Antes solo ustedes se enteraban (el correo que armamos la vez pasada); ahora la persona también recibe un acuse de recibo corto ("recibimos tu mensaje, te contestamos pronto").

2. **Recordatorio de carrito abandonado.** Si alguien empieza el checkout de Stripe y no lo termina, `api/webhook.js` ahora escucha el evento `checkout.session.expired` (Stripe expira las sesiones a las ~24h por default) y, si la persona alcanzó a escribir su email antes de irse, le manda un correo suave tipo "¿te quedaste viendo esta pieza? sigue disponible" — solo si la obra sigue disponible (si ya se vendió, no manda nada). **Necesito que actives este evento en Stripe** (ver abajo, es un paso rápido).

3. **Formulario de newsletter en la portada** (footer de `index.html`, junto al logo). Guarda el email como contacto en una Audience de Resend a través de un endpoint nuevo (`/api/subscribe.js`). Desde ahí puedes mandar boletines directamente desde el dashboard de Resend (Broadcasts) sin que tengamos que construir un sistema de envío de newsletters desde cero — Resend ya se encarga del unsubscribe/cumplimiento legal automáticamente en esos envíos. Por ahora solo lo puse en la portada; si quieres lo agrego también al footer del shop y las demás páginas.

## 🔴 Necesito esto de ti para que funcione

### 1. Activar el evento `checkout.session.expired` en Stripe
1. Ve a **Stripe Dashboard** → **Developers** → **Webhooks** → click en tu endpoint (el que ya apunta a `/api/webhook`).
2. Click **"+ Add events"** (o el botón de editar eventos).
3. Busca y agrega `checkout.session.expired`.
4. Guarda.

No necesitas tocar nada más — la firma/secreto del webhook (`STRIPE_WEBHOOK_SECRET`) es el mismo para todos los eventos de ese endpoint.

### 2. Crear la Audience en Resend para la newsletter
1. Ve a **resend.com** → **Audiences** → **Create Audience** → nómbrala algo como "Newsletter — Mixi Art Studio".
2. Copia el **Audience ID** (se ve como `78261eea-8f8b-4381-83c6-79fa7120f1cf`).
3. Ve a **Vercel** → `mixi-art-studio` → **Settings** → **Environment Variables** → **Add New**:
   - Nombre: `RESEND_AUDIENCE_ID`
   - Valor: el ID que copiaste
   - Aplica a Production → guarda → redeploy.

En cuanto tengas gente suscrita, puedes armar y mandar un boletín directo desde Resend → Broadcasts, eligiendo esa Audience — no necesitas que yo escriba código para cada envío.

### 3. Analytics y Meta Pixel (para medir tráfico y hacer retargeting)
Esto es lo de mayor impacto de todo lo que platicamos y lo puedo dejar listo en minutos en cuanto me des los IDs:

- **Google Analytics 4**: si no tienes cuenta, créala gratis en **analytics.google.com** → Admin → Create Property → dale el sitio `mixiartstudio.us`. Te va a dar un **Measurement ID** con formato `G-XXXXXXXXXX`. Pásamelo.
- **Meta Pixel**: en **business.facebook.com** → Events Manager → Connect Data Sources → Web → crea un Pixel. Te da un **Pixel ID** (solo números, ~16 dígitos). Pásamelo.

En cuanto tenga los dos IDs, los inserto en todas las páginas del sitio (no solo la portada) para que puedas ver de dónde viene tu tráfico y armar campañas de retargeting a gente que vio una obra específica y no compró.

## 🟢 Ideas que platicamos y quedan para después (no requieren código todavía)
- Promocionar más visiblemente Klarna/Afterpay en el sitio.
- Explorar Artsy / Saatchi Art como canales de descubrimiento.
- Colaboraciones con diseñadores de interiores/arquitectos en Salt Lake City.
- Sección de blog/contenido editorial para SEO a largo plazo.
