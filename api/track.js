// /api/track.js
// Incrementa el contador de vistas (views) de una obra en Sanity.
// Llamado automáticamente cuando alguien abre artwork.html
// Usa sessionStorage para no contar recargas del mismo usuario.

const SANITY_PROJECT = process.env.SANITY_PROJECT_ID
const SANITY_DATASET = process.env.SANITY_DATASET
const SANITY_TOKEN   = process.env.SANITY_WRITE_TOKEN
const DOMAIN         = 'https://mixiartstudio.us'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', DOMAIN)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' })

  const { slug } = req.body
  if (!slug) return res.status(400).json({ error: 'Missing slug' })

  try {
    // Buscar el _id de la obra
    const query = encodeURIComponent(`*[_type == "artwork" && slug.current == "${slug}"][0]{ _id, views }`)
    const qUrl  = `https://${SANITY_PROJECT}.api.sanity.io/v2024-01-01/data/query/${SANITY_DATASET}?query=${query}`
    const qRes  = await fetch(qUrl, {
      headers: { Authorization: `Bearer ${SANITY_TOKEN}` },
    })
    const qJson = await qRes.json()
    const artwork = qJson.result

    if (!artwork) return res.status(404).json({ error: 'Artwork not found' })

    // Incrementar views
    const mUrl = `https://${SANITY_PROJECT}.api.sanity.io/v2024-01-01/data/mutate/${SANITY_DATASET}`
    await fetch(mUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${SANITY_TOKEN}`,
      },
      body: JSON.stringify({
        mutations: [{
          patch: {
            id:  artwork._id,
            set: { views: (artwork.views || 0) + 1 },
          },
        }],
      }),
    })

    return res.status(200).json({ success: true })

  } catch (err) {
    console.error('[track] Error:', err.message)
    return res.status(500).json({ error: 'Failed to track view' })
  }
}
