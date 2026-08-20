// /api/webhook.js
// Recibe eventos de Stripe (checkout.session.completed)
// Cuando se completa un pago:
//   1. Marca la obra como "sold" en Sanity
//   2. Registra la venta como inquiry cerrado
//   3. Envía el correo de confirmación al comprador
//   4. Envía el correo de notificación interna a Mixi

import Stripe from 'stripe'
import { sendEmail } from './_lib/resend.js'
import { customerConfirmationEmail, internalSaleNotificationEmail } from './_lib/email-templates.js'
import { resolveOrigin, deliveryEstimateFor } from './_lib/origin.js'

const stripe    = new Stripe(process.env.STRIPE_SECRET_KEY)
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET
const SANITY_PROJECT = process.env.SANITY_PROJECT_ID   // vocdg9am
const SANITY_DATASET = process.env.SANITY_DATASET       // production
const SANITY_TOKEN   = process.env.SANITY_WRITE_TOKEN   // token con permisos de escritura

// Remitente para los correos transaccionales. El dominio debe estar verificado en Resend
// (Resend → Domains → Add Domain → mixiartstudio.us) antes de que estos envíos funcionen.
const ORDERS_FROM   = 'Mixi Art Studio <orders@mixiartstudio.us>'
const INTERNAL_TO   = 'info@mixiartstudio.us'

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

async function getArtworkForEmail(slug) {
  const query = encodeURIComponent(`
    *[_type == "artwork" && !(_id in path("drafts.**")) && slug.current == "${slug}"][0]{
      _id, title, mainImage, dimensions,
      "artistName": artist->name,
      "artistBasedIn": artist->basedIn,
      "artistNationality": artist->nationality
    }
  `)
  const url = `https://${SANITY_PROJECT}.api.sanity.io/v2024-01-01/data/query/${SANITY_DATASET}?query=${query}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${SANITY_TOKEN}` } })
  const json = await res.json()
  return json.result || null
}

// La Checkout Session expone la dirección de envío en `shipping_details` en las
// versiones recientes de la API de Stripe, y en `shipping.address` en versiones
// anteriores. Revisamos ambas para no depender de qué versión esté fijada la cuenta.
function extractShippingAddress(session) {
  const shipping = session.shipping_details || session.shipping || null
  return shipping?.address || null
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
    // 1. Obtener los datos de la obra en Sanity
    const artwork = await getArtworkForEmail(artworkSlug)
    if (!artwork) {
      console.error(`[webhook] Artwork not found in Sanity: ${artworkSlug}`)
      return res.status(200).json({ received: true, action: 'artwork_not_found' })
    }

    // 2. Marcar como sold
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
    const buyerPhone = session.customer_details?.phone || ''
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

    // 4. Enviar correos de confirmación (comprador + Mixi).
    //    Un fallo aquí NO debe hacer fallar el webhook — la obra ya quedó marcada
    //    como vendida y registrada, que es lo crítico. Solo se loguea el error.
    try {
      const shippingAddress = extractShippingAddress(session)
      const billingAddress  = session.customer_details?.address || null
      const currency         = session.currency || 'usd'
      const amountSubtotal   = session.amount_subtotal ?? null
      const shippingAmount   = session.shipping_cost?.amount_total ??
        (session.amount_total != null && amountSubtotal != null ? session.amount_total - amountSubtotal : null)

      // La obra no siempre sale de Salt Lake City — sale de donde esté
      // basado el artista (con nacionalidad como respaldo). Ver _lib/origin.js.
      const origin = resolveOrigin({ basedIn: artwork.artistBasedIn, nationality: artwork.artistNationality })

      const emailData = {
        artworkTitle: artwork.title,
        artistName:   artwork.artistName || '',
        artworkSlug,
        mainImage:    artwork.mainImage || '',
        sizeTier:     session.metadata?.sizeTier || '',
        buyerName, buyerEmail, buyerPhone,
        shippingAddress, billingAddress,
        amountSubtotal, shippingAmount,
        amountTotal:  session.amount_total,
        currency,
        originLabel: origin.label,
        deliveryEstimate: shippingAddress?.country ? deliveryEstimateFor(origin.bucket, shippingAddress.country) : '',
        sessionId:       session.id,
        paymentIntentId: session.payment_intent,
      }

      const customerEmail = customerConfirmationEmail(emailData)
      const internalEmail = internalSaleNotificationEmail(emailData)

      await Promise.all([
        buyerEmail
          ? sendEmail({ to: buyerEmail, from: ORDERS_FROM, replyTo: INTERNAL_TO, ...customerEmail })
          : Promise.resolve(),
        sendEmail({ to: INTERNAL_TO, from: ORDERS_FROM, ...internalEmail }),
      ])

      console.log(`[webhook] ✅ Confirmation emails sent for ${artworkSlug}`)
    } catch (emailErr) {
      console.error('[webhook] Failed to send confirmation emails:', emailErr.message)
    }

    return res.status(200).json({ received: true, action: 'marked_sold', artworkSlug })

  } catch (err) {
    console.error('[webhook] Error processing sale:', err.message)
    // Retornamos 200 para que Stripe no reintente — el error se loguea
    return res.status(200).json({ received: true, action: 'error', error: err.message })
  }
}
