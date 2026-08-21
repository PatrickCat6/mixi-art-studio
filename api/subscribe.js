// /api/subscribe.js
// Recibe un email desde el formulario de newsletter del sitio y lo agrega
// como contacto a una Audience de Resend (Resend > Audiences). Desde ahí,
// Bryan puede mandar boletines directamente desde el dashboard de Resend
// (Broadcasts) sin que tengamos que construir un sistema de envío propio —
// Resend ya maneja el unsubscribe/compliance automáticamente para esos envíos.
//
// Requiere dos variables de entorno en Vercel:
//   RESEND_API_KEY      (ya configurada — se usa para los demás correos)
//   RESEND_AUDIENCE_ID  (nueva — se crea en Resend > Audiences > Create Audience)

const RESEND_API_KEY     = process.env.RESEND_API_KEY
const RESEND_AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID
const DOMAIN              = 'https://mixiartstudio.us'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', DOMAIN)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' })

  const { email } = req.body || {}

  if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'Please enter a valid email address' })
  }

  if (!RESEND_API_KEY || !RESEND_AUDIENCE_ID) {
    console.error('[subscribe] Missing RESEND_API_KEY or RESEND_AUDIENCE_ID')
    return res.status(500).json({ error: 'Newsletter signup is not configured yet' })
  }

  try {
    const resendRes = await fetch(`https://api.resend.com/audiences/${RESEND_AUDIENCE_ID}/contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({ email: email.trim().toLowerCase(), unsubscribed: false }),
    })

    // Si el contacto ya existía, Resend puede responder con un error de
    // "ya existe" en vez de simplemente actualizarlo — para quien llena el
    // formulario, ya estar suscrito es un éxito, no un error.
    if (!resendRes.ok) {
      const text = await resendRes.text()
      const alreadyExists = resendRes.status === 400 && /already|exist/i.test(text)
      if (!alreadyExists) {
        console.error(`[subscribe] Resend error ${resendRes.status}: ${text}`)
        return res.status(500).json({ error: 'Failed to subscribe — please try again' })
      }
    }

    console.log(`[subscribe] ✅ Subscribed ${email}`)
    return res.status(200).json({ success: true })

  } catch (err) {
    console.error('[subscribe] Error:', err.message)
    return res.status(500).json({ error: 'Failed to subscribe — please try again' })
  }
}
