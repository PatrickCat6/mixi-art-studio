// /api/checkout.js
// Crea una Stripe Checkout Session para una obra específica.
// Recibe: { artworkSlug, imageUrl }
// Devuelve: { url } — URL del checkout de Stripe
//
// IMPORTANTE: el precio y el costo de envío NUNCA se toman del cliente.
// Se leen en el servidor directamente desde Sanity, para que nadie pueda
// manipular la petición (devtools / fetch manual) y comprar una obra
// pagando menos de lo que cuesta realmente.

import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

const DOMAIN = 'https://mixiartstudio.us'

const SANITY_PROJECT = process.env.SANITY_PROJECT_ID
const SANITY_DATASET = process.env.SANITY_DATASET
const SANITY_TOKEN   = process.env.SANITY_READ_TOKEN

// ── TARIFAS DE ENVÍO ──────────────────────────────────────
// Editar aquí para ajustar precios. Montos en centavos de USD.
// El tamaño se calcula a partir de la dimensión mayor de la obra (in),
// usando los mismos rangos que el filtro "Small/Medium/Large" del Shop.
const SHIPPING_RATES = {
  small:  { domestic: 6500,  international: 15000 },  // < 24 in
  medium: { domestic: 12500, international: 30000 },  // 24–48 in
  large:  { domestic: 25000, international: 60000 },  // > 48 in
}

function sizeTierFor(dimensions) {
  const max = Math.max(Number(dimensions?.width) || 0, Number(dimensions?.height) || 0)
  if (max > 48) return 'large'
  if (max >= 24) return 'medium'
  return 'small'
}

async function getArtworkForCheckout(slug) {
  const query = encodeURIComponent(`
    *[_type == "artwork" && !(_id in path("drafts.**")) && slug.current == "${slug}"][0]{
      title, price, priceOnRequest, availability, dimensions,
      "artistName": artist->name
    }
  `)
  const url = `https://${SANITY_PROJECT}.api.sanity.io/v2024-01-01/data/query/${SANITY_DATASET}?query=${query}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${SANITY_TOKEN}` } })
  if (!res.ok) throw new Error(`Sanity query failed: ${res.status}`)
  const json = await res.json()
  return json.result || null
}

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', DOMAIN)
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { artworkSlug, imageUrl } = req.body

  if (!artworkSlug) {
    return res.status(400).json({ error: 'Missing required field: artworkSlug' })
  }

  if (!SANITY_PROJECT || !SANITY_DATASET || !SANITY_TOKEN) {
    console.error('[checkout] Missing Sanity env vars')
    return res.status(500).json({ error: 'Server not configured' })
  }

  try {
    // Precio, disponibilidad y dimensiones — siempre desde Sanity, nunca del cliente
    const artwork = await getArtworkForCheckout(artworkSlug)

    if (!artwork) {
      return res.status(404).json({ error: 'Artwork not found' })
    }
    if (artwork.availability !== 'available') {
      return res.status(409).json({ error: 'This artwork is no longer available' })
    }
    if (artwork.priceOnRequest || typeof artwork.price !== 'number' || artwork.price < 1) {
      return res.status(400).json({ error: 'This artwork is not available for direct checkout' })
    }

    const tier = sizeTierFor(artwork.dimensions)
    const rates = SHIPPING_RATES[tier]

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',

      // Métodos de pago: tarjeta + Klarna + Afterpay
      payment_method_types: ['card', 'klarna', 'afterpay_clearpay'],

      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(artwork.price * 100), // Stripe usa centavos
            product_data: {
              name: artwork.title,
              description: artwork.artistName ? `By ${artwork.artistName} · Mixi Art Studio` : 'Mixi Art Studio',
              images: imageUrl ? [imageUrl] : [],
              metadata: {
                artworkSlug,
                artistName: artwork.artistName || '',
              },
            },
          },
          quantity: 1,
        },
      ],

      // Metadata para el webhook — identifica qué obra se vendió
      metadata: {
        artworkSlug,
        artworkTitle: artwork.title,
        artistName: artwork.artistName || '',
        sizeTier: tier,
      },

      // URLs de redirección post-pago
      success_url: `${DOMAIN}/artwork.html?slug=${artworkSlug}&payment=success`,
      cancel_url:  `${DOMAIN}/artwork.html?slug=${artworkSlug}&payment=cancelled`,

      // Datos de shipping — arte físico requiere dirección
      shipping_address_collection: {
        allowed_countries: [
          'US', 'CA', 'MX', 'GB', 'DE', 'FR', 'ES', 'IT', 'NL', 'AU',
          'JP', 'BR', 'AR', 'CO', 'CL', 'PE',
        ],
      },

      // Opciones de envío — el comprador elige la que corresponde a su dirección.
      // El precio depende del tamaño de la obra (small/medium/large).
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: rates.domestic, currency: 'usd' },
            display_name: 'Domestic Shipping (US)',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 5 },
              maximum: { unit: 'business_day', value: 10 },
            },
          },
        },
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: rates.international, currency: 'usd' },
            display_name: 'International Shipping',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 10 },
              maximum: { unit: 'business_day', value: 21 },
            },
          },
        },
      ],

      // Facturación
      billing_address_collection: 'required',

      // Permitir promocodes si los crean en Stripe
      allow_promotion_codes: true,

      // Teléfono del comprador (útil para seguimiento de envío)
      phone_number_collection: { enabled: true },
    })

    return res.status(200).json({ url: session.url })

  } catch (err) {
    console.error('[checkout] Error:', err.message)
    return res.status(500).json({ error: 'Failed to create checkout session', details: err.message })
  }
}
