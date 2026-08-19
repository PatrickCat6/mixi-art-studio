// /api/_lib/resend.js
// Envío de correos transaccionales vía Resend (https://resend.com).
//
// Requiere la variable de entorno RESEND_API_KEY en Vercel (Project Settings → Environment Variables).
// El dominio mixiartstudio.us debe estar verificado en el panel de Resend (Domains → Add Domain)
// antes de poder enviar desde direcciones @mixiartstudio.us. Mientras el dominio no esté verificado,
// Resend rechazará los envíos con un error 403.

const RESEND_API_KEY = process.env.RESEND_API_KEY

export async function sendEmail({ to, from, subject, html, text, replyTo }) {
  if (!RESEND_API_KEY) {
    console.warn('[resend] RESEND_API_KEY no configurada — correo no enviado:', subject)
    return { skipped: true }
  }

  const payload = {
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  }
  if (text) payload.text = text
  if (replyTo) payload.reply_to = replyTo

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Resend error ${res.status}: ${errText}`)
  }

  return res.json()
}
