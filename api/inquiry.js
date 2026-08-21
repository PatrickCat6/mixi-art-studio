// /api/inquiry.js
// Recibe un POST con los datos del formulario de inquiry
// y crea un documento en Sanity + incrementa inquiryCount en la obra +
// avisa a info@mixiartstudio.us por correo (antes esto último no pasaba —
// el inquiry se guardaba en silencio y nadie se enteraba hasta el resumen
// semanal o hasta entrar a Sanity Studio).

import { sendEmail } from './_lib/resend.js'
import { internalInquiryNotificationEmail, customerInquiryConfirmationEmail } from './_lib/email-templates.js'

const SANITY_PROJECT = process.env.SANITY_PROJECT_ID
const SANITY_DATASET = process.env.SANITY_DATASET
const SANITY_TOKEN   = process.env.SANITY_WRITE_TOKEN
const DOMAIN         = 'https://mixiartstudio.us'
const INTERNAL_TO    = 'info@mixiartstudio.us'
const ORDERS_FROM    = 'Mixi Art Studio <orders@mixiartstudio.us>'

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
  const query = encodeURIComponent(`*[_type == "artwork" && !(_id in path("drafts.**")) && slug.current == "${slug}"][0]{ _id, inquiryCount, title, "artistName": artist->name }`)
  const url   = `https://${SANITY_PROJECT}.api.sanity.io/v2024-01-01/data/query/${SANITY_DATASET}?query=${query}`
  const res   = await fetch(url, {
    headers: { Authorization: `Bearer ${SANITY_TOKEN}` },
  })
  const json = await res.json()
  return json.result || null
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', DOMAIN)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' })

  const { artworkSlug, artworkTitle, name, email, phone, message, interestedInInstallments } = req.body

  // Validaciones
  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Name and email are required' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' })
  }

  try {
    const mutations = []

    // 1. Crear documento inquiry en Sanity
    const inquiryDoc = {
      _type:  'inquiry',
      name:   name.trim(),
      email:  email.trim().toLowerCase(),
      phone:  phone?.trim() || '',
      message: message?.trim() || '',
      status: 'new',
      interestedInInstallments: !!interestedInInstallments,
    }

    // Si viene con slug, vincular a la obra
    let artwork = null
    if (artworkSlug) {
      artwork = await getArtworkIdBySlug(artworkSlug)
      if (artwork) {
        inquiryDoc.artwork = { _type: 'reference', _ref: artwork._id }

        // 2. Incrementar inquiryCount en la obra
        const currentCount = artwork.inquiryCount || 0
        mutations.push({
          patch: {
            id:  artwork._id,
            set: { inquiryCount: currentCount + 1 },
          },
        })
      }
    }

    mutations.push({ create: inquiryDoc })

    await sanityMutation(mutations)

    console.log(`[inquiry] ✅ New inquiry from ${email} about ${artworkSlug || 'general'}`)

    // 3. Avisar a info@ por correo y confirmarle al cliente que su mensaje
    //    llegó. Un fallo aquí NO debe hacer fallar el endpoint — el inquiry
    //    ya quedó guardado en Sanity, que es lo crítico.
    try {
      const resolvedTitle = artwork?.title || artworkTitle || ''
      const resolvedArtist = artwork?.artistName || ''

      const notification = internalInquiryNotificationEmail({
        name: inquiryDoc.name,
        email: inquiryDoc.email,
        phone: inquiryDoc.phone,
        message: inquiryDoc.message,
        interestedInInstallments: inquiryDoc.interestedInInstallments,
        artworkTitle: resolvedTitle,
        artworkSlug,
        artistName: resolvedArtist,
      })
      const confirmation = customerInquiryConfirmationEmail({
        name: inquiryDoc.name,
        artworkTitle: resolvedTitle,
        artworkSlug,
        artistName: resolvedArtist,
      })

      await Promise.all([
        sendEmail({ to: INTERNAL_TO, from: ORDERS_FROM, replyTo: inquiryDoc.email, ...notification }),
        sendEmail({ to: inquiryDoc.email, from: ORDERS_FROM, replyTo: INTERNAL_TO, ...confirmation }),
      ])
      console.log(`[inquiry] ✅ Notification + confirmation emails sent for ${email}`)
    } catch (emailErr) {
      console.error('[inquiry] Failed to send emails:', emailErr.message)
    }

    return res.status(200).json({ success: true })

  } catch (err) {
    console.error('[inquiry] Error:', err.message)
    return res.status(500).json({ error: 'Failed to submit inquiry' })
  }
}
