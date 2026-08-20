// /api/weekly-digest.js
// Resumen semanal enviado a info@mixiartstudio.us:
//   1. Inquiries con status "new" que llevan más de 3 días sin respuesta.
//   2. Obras más vistas de la última semana (comparando contra el snapshot
//      de vistas guardado la vez anterior en el documento "weeklyDigestState").
//
// Disparado por Vercel Cron (ver "crons" en vercel.json). Si la variable de
// entorno CRON_SECRET está configurada en Vercel, este endpoint solo acepta
// llamadas que incluyan el header Authorization que Vercel Cron añade
// automáticamente — así nadie más puede dispararlo desde afuera.

import { sendEmail } from './_lib/resend.js'
import { weeklyDigestEmail } from './_lib/email-templates.js'

const SANITY_PROJECT = process.env.SANITY_PROJECT_ID
const SANITY_DATASET = process.env.SANITY_DATASET
const SANITY_TOKEN   = process.env.SANITY_WRITE_TOKEN

const DIGEST_FROM  = 'Mixi Art Studio <orders@mixiartstudio.us>'
const INTERNAL_TO  = 'info@mixiartstudio.us'
const STALE_DAYS    = 3
const DIGEST_STATE_ID = 'weeklyDigestState'

async function sanityQuery(groq) {
  const url = `https://${SANITY_PROJECT}.api.sanity.io/v2024-01-01/data/query/${SANITY_DATASET}?query=${encodeURIComponent(groq)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${SANITY_TOKEN}` } })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Sanity query failed: ${res.status} ${text}`)
  }
  const json = await res.json()
  return json.result
}

async function sanityMutation(mutations) {
  const url = `https://${SANITY_PROJECT}.api.sanity.io/v2024-01-01/data/mutate/${SANITY_DATASET}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SANITY_TOKEN}` },
    body: JSON.stringify({ mutations }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Sanity mutation failed: ${res.status} ${text}`)
  }
  return res.json()
}

function formatWeekLabel(now) {
  return now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default async function handler(req, res) {
  // Solo Vercel Cron (o alguien con el secreto) puede disparar este endpoint.
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers.authorization
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  try {
    const now = new Date()
    const cutoff = new Date(now.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString()

    // 1. Inquiries sin respuesta hace más de STALE_DAYS días.
    const staleInquiriesRaw = await sanityQuery(`
      *[_type == "inquiry" && status == "new" && _createdAt < "${cutoff}"] | order(_createdAt asc) {
        name, email, phone, message, _createdAt,
        "artworkTitle": artwork->title,
        "artworkSlug": artwork->slug.current,
        "artistName": artwork->artist->name
      }
    `)
    const staleInquiries = (staleInquiriesRaw || []).map(i => ({
      ...i,
      daysAgo: Math.floor((now.getTime() - new Date(i._createdAt).getTime()) / 86400000),
    }))

    // 2. Snapshot de vistas de la corrida anterior (para calcular el delta semanal).
    const previousState = await sanityQuery(`*[_id == "${DIGEST_STATE_ID}"][0]{snapshot}`)
    const isFirstRun = !previousState

    // 3. Vistas actuales de todas las obras publicadas.
    const allArtworks = await sanityQuery(`
      *[_type == "artwork" && defined(slug.current)] {
        "slug": slug.current, title, views,
        "artistName": artist->name
      }
    `)

    const prevSnapshot = previousState?.snapshot || {}
    const newSnapshot = {}
    const mostViewed = []

    for (const a of allArtworks || []) {
      const views = a.views || 0
      newSnapshot[a.slug] = views
      if (!isFirstRun) {
        const delta = views - (prevSnapshot[a.slug] || 0)
        if (delta > 0) mostViewed.push({ slug: a.slug, title: a.title, artistName: a.artistName, delta })
      }
    }
    mostViewed.sort((a, b) => b.delta - a.delta)
    const topMostViewed = mostViewed.slice(0, 5)

    // 4. Enviar el resumen.
    const weekLabel = formatWeekLabel(now)
    const digestEmail = weeklyDigestEmail({ weekLabel, staleInquiries, mostViewed: topMostViewed, isFirstRun })
    await sendEmail({ to: INTERNAL_TO, from: DIGEST_FROM, ...digestEmail })

    // 5. Guardar el snapshot de esta corrida para la próxima comparación.
    await sanityMutation([{
      createOrReplace: {
        _id: DIGEST_STATE_ID,
        _type: 'weeklyDigestState',
        snapshot: newSnapshot,
        updatedAt: now.toISOString(),
      },
    }])

    return res.status(200).json({
      sent: true,
      staleInquiries: staleInquiries.length,
      mostViewed: topMostViewed.length,
      isFirstRun,
    })
  } catch (err) {
    console.error('[weekly-digest] Error:', err.message)
    return res.status(500).json({ error: 'Failed to send weekly digest' })
  }
}
