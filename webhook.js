// /api/webhook.js
// Recibe eventos de Stripe (checkout.session.completed)
// Cuando se completa un pago:
//   1. Marca la obra como "sold" en Sanity
//   2. Incrementa inquiryCount en Sanity
//   3. Envía notificación interna (opcional — ver comentario al final)

import Stripe from 'stripe'

const stripe    = new Stripe(process.env.STRIPE_SECRET_KEY)
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET
const SANITY_PROJECT = process.env.SANITY_PROJECT_ID   // vocdg9am
const SANITY_DATASET = process.env.SANITY_DATASET       // production
const SANITY_TOKEN   = process.env.SANITY_WRITE_TOKEN   // token con permisos de escritura

// Vercel necesita el body raw para verificar la firma de Stripe
export const config = { api: { bodyParser: false } }

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end',  () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function sanityMutation(mutations) {
  const url = `https://${SANITY_PROJECT}.api.sanity.io/v2024-01-01/data/mutate/${SANITY_DATASET}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${SANITY_TOKEN}`,
    },
    body: JSON.stringify({ mutations }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Sanity mutation failed: ${res.status} ${text}`)
  }
  return res.json()
}

async function getArtworkIdBySlug(slug) {
  const query = encodeURIComponent(`*[_type == "artwork" && slug.current == "${slug}"][0]{ _id, inquiryCount }`)
  const url   = `https://${SANITY_PROJECT}.api.sanity.io/v2024-01-01/data/query/${SANITY_DATASET}?query=${query}`
  const res   = await fetch(url, {
    headers: { Authorization: `Bearer ${SANITY_TOKEN}` },
  })
  const json  = await res.json()
  return json.result || null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const rawBody = await getRawBody(req)
  const sig     = req.headers['stripe-signature']

  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET)
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err.message)
    return res.status(400).json({ error: `Webhook signature error: ${err.message}` })
  }

  // Solo nos interesa checkout.session.completed
  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true, action: 'ignored' })
  }

  const session     = event.data.object
  const artworkSlug = session.metadata?.artworkSlug

  if (!artworkSlug) {
    console.warn('[webhook] No artworkSlug in session metadata')
    return res.status(200).json({ received: true, action: 'no_slug' })
  }

  try {
    // 1. Obtener el _id de la obra en Sanity
    const artwork = await getArtworkIdBySlug(artworkSlug)
    if (!artwork) {
      console.error(`[webhook] Artwork not found in Sanity: ${artworkSlug}`)
      return res.status(200).json({ received: true, action: 'artwork_not_found' })
    }

    // 2. Marcar como sold + incrementar contador de sales
    await sanityMutation([
      {
        patch: {
          id: artwork._id,
          set: { availability: 'sold' },
        },
      },
    ])

    console.log(`[webhook] ✅ Artwork marked as SOLD: ${artworkSlug} (${artwork._id})`)

    // 3. Registrar la venta como inquiry cerrado
    const buyerEmail = session.customer_details?.email || ''
    const buyerName  = session.customer_details?.name  || ''
    const amountPaid = (session.amount_total / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

    await sanityMutation([
      {
        create: {
          _type: 'inquiry',
          artwork: { _type: 'reference', _ref: artwork._id },
          name:    buyerName,
          email:   buyerEmail,
          message: `Purchase completed via Stripe. Amount: ${amountPaid}. Session: ${session.id}`,
          status:  'closed',
          notes:   `Stripe session ID: ${session.id}\nPayment intent: ${session.payment_intent}`,
          interestedInInstallments: false,
        },
      },
    ])

    return res.status(200).json({ received: true, action: 'marked_sold', artworkSlug })

  } catch (err) {
    console.error('[webhook] Error processing sale:', err.message)
    // Retornamos 200 para que Stripe no reintente — el error se loguea
    return res.status(200).json({ received: true, action: 'error', error: err.message })
  }
}

// ── PARA AGREGAR NOTIFICACIÓN POR EMAIL ────────────────────────────────────────
// Instalar: npm install @sendgrid/mail
// Agregar variable de entorno: SENDGRID_API_KEY
// Descomentar y adaptar:
//
// import sgMail from '@sendgrid/mail'
// sgMail.setApiKey(process.env.SENDGRID_API_KEY)
// await sgMail.send({
//   to:      'info@mixiartstudio.us',
//   from:    'no-reply@mixiartstudio.us',
//   subject: `🎉 Obra vendida: ${session.metadata.artworkTitle}`,
//   text:    `Comprador: ${buyerName} (${buyerEmail})\nMonto: ${amountPaid}\nObra: ${artworkSlug}`,
// })
