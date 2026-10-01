// /api/artists.js
// Proxy de solo lectura hacia Sanity para la página de Artistas.
// Solo devuelve artistas que tienen al menos una obra disponible.
// El token de lectura vive únicamente en variables de entorno de Vercel.
//
// GET /api/artists -> listado de artistas con obras disponibles

const SANITY_PROJECT = process.env.SANITY_PROJECT_ID
const SANITY_DATASET = process.env.SANITY_DATASET
const SANITY_TOKEN   = process.env.SANITY_READ_TOKEN
const DOMAIN         = 'https://mixiartstudio.us'

const ARTISTS_QUERY = `
  *[_type == "artist" && !(_id in path("drafts.**")) &&
    count(*[_type == "artwork" && references(^._id) && availability == "available" && !(_id in path("drafts.**"))]) > 0
  ] | order(name asc) {
    name,
    "slug": slug.current,
    nationality,
    basedIn,
    "portrait": portrait.asset->url,
    "artworkCount": count(*[_type == "artwork" && references(^._id) && availability == "available" && !(_id in path("drafts.**"))]),
    "firstArtwork": *[_type == "artwork" && references(^._id) && availability == "available" && !(_id in path("drafts.**"))] | order(_createdAt desc) [0] {
      title,
      "image": mainImage.asset->url
    }
  }
`

async function sanityFetch(groqQuery) {
  const query = encodeURIComponent(groqQuery)
  const url = `https://${SANITY_PROJECT}.api.sanity.io/v2024-01-01/data/query/${SANITY_DATASET}?query=${query}`
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${SANITY_TOKEN}` },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Sanity query failed: ${res.status} ${text}`)
    }
    return res.json()
  } finally {
    clearTimeout(t)
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', DOMAIN)
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  // Cachear en el edge — la lista de artistas no cambia frecuentemente
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' })

  if (!SANITY_PROJECT || !SANITY_DATASET || !SANITY_TOKEN) {
    console.error('[artists] Missing Sanity env vars')
    return res.status(500).json({ error: 'Server not configured' })
  }

  try {
    const json = await sanityFetch(ARTISTS_QUERY)
    return res.status(200).json({ result: json.result || [] })
  } catch (err) {
    console.error('[artists] Error:', err.message)
    return res.status(500).json({ error: 'Failed to fetch artists' })
  }
}
