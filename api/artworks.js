// /api/artworks.js
// Proxy de solo lectura hacia Sanity para el Shop y la página de detalle de obra.
// El token de lectura vive únicamente en variables de entorno de Vercel,
// nunca se expone en el HTML/JS del cliente.
//
// GET /api/artworks            -> listado completo (usado por shop.html)
// GET /api/artworks?slug=xxxx  -> una sola obra con detalle completo (usado por artwork.html)

const SANITY_PROJECT = process.env.SANITY_PROJECT_ID
const SANITY_DATASET = process.env.SANITY_DATASET
const SANITY_TOKEN   = process.env.SANITY_READ_TOKEN
const DOMAIN         = 'https://mixiartstudio.us'

const LIST_QUERY = `
  *[_type == "artwork"] | order(_createdAt desc) {
    title, "slug": slug.current, "mainImage": mainImage.asset->url,
    "artistName": artist->name, "artistSlug": artist->slug.current,
    medium, year, dimensions, materials, category, availability,
    price, priceOnRequest, installmentsAvailable, featured
  }
`

function detailQuery(slug) {
  return `
    *[_type == "artwork" && slug.current == "${slug}"][0]{
      title, "slug": slug.current, "mainImage": mainImage.asset->url,
      "images": images[]{ "url": asset->url, caption }, videoUrl,
      materials, medium, year, dimensions,
      rarity, signature, certificateOfAuthenticity, frame, condition,
      description, availability, price, priceOnRequest, installmentsAvailable,
      views, inquiryCount,
      "artist": artist->{ name, "slug": slug.current, nationality, birthYear, basedIn, "portrait": portrait.asset->url, bio }
    }
  `
}

// Solo letras, números y guiones — evita inyección dentro del literal GROQ.
const SLUG_RE = /^[a-z0-9-]+$/i

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
  // Cachear brevemente en el edge para no golpear Sanity en cada carga
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' })

  if (!SANITY_PROJECT || !SANITY_DATASET || !SANITY_TOKEN) {
    console.error('[artworks] Missing Sanity env vars')
    return res.status(500).json({ error: 'Server not configured' })
  }

  const { slug } = req.query || {}

  try {
    if (slug) {
      if (!SLUG_RE.test(slug)) {
        return res.status(400).json({ error: 'Invalid slug' })
      }
      const json = await sanityFetch(detailQuery(slug))
      return res.status(200).json({ result: json.result || null })
    }

    const json = await sanityFetch(LIST_QUERY)
    return res.status(200).json({ result: json.result || [] })

  } catch (err) {
    console.error('[artworks] Error:', err.message)
    return res.status(500).json({ error: 'Failed to fetch artworks' })
  }
}
