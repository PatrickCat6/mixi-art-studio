// /api/checkout.js
// Crea una Stripe Checkout Session para una obra específica.
// Recibe: { artworkSlug, artworkTitle, artistName, price, imageUrl }
// Devuelve: { url } — URL del checkout de Stripe

import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

const DOMAIN = 'https://mixiartstudio.us'

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

  const { artworkSlug, artworkTitle, artistName, price, imageUrl } = req.body

  // Validaciones básicas
  if (!artworkSlug || !artworkTitle || !price) {
    return res.status(400).json({ error: 'Missing required fields: artworkSlug, artworkTitle, price' })
  }
  if (typeof price !== 'number' || price < 1) {
    return res.status(400).json({ error: 'Invalid price' })
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',

      // Métodos de pago: tarjeta + Klarna + Afterpay
      payment_method_types: ['card', 'klarna', 'afterpay_clearpay'],

      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(price * 100), // Stripe usa centavos
            product_data: {
              name: artworkTitle,
              description: artistName ? `By ${artistName} · Mixi Art Studio` : 'Mixi Art Studio',
              images: imageUrl ? [imageUrl] : [],
              metadata: {
                artworkSlug,
                artistName: artistName || '',
              },
            },
          },
          quantity: 1,
        },
      ],

      // Metadata para el webhook — identifica qué obra se vendió
      metadata: {
        artworkSlug,
        artworkTitle,
        artistName: artistName || '',
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

      // Opciones de envío (estimadas — ajustar con tarifas reales)
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 0, currency: 'usd' },
            display_name: 'Shipping — calculated separately',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 5 },
              maximum: { unit: 'business_day', value: 14 },
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
    console.error('[checkout] Stripe error:', err.message)
    return res.status(500).json({ error: 'Failed to create checkout session', details: err.message })
  }
}
