// /api/sitemap.js
// Genera sitemap.xml dinámicamente: incluye las páginas estáticas del sitio
// MÁS una entrada por cada obra publicada (antes el sitemap.xml era un
// archivo estático con solo las 10 páginas fijas — las 90+ páginas de detalle
// de obra nunca se le comunicaban a Google).
//
// vercel.json reescribe /sitemap.xml -> /api/sitemap (el archivo estático
// sitemap.xml se eliminó del repo para que esta ruta dinámica tome su lugar).

const SANITY_PROJECT = process.env.SANITY_PROJECT_ID
const SANITY_DATASET = process.env.SANITY_DATASET
const SANITY_TOKEN   = process.env.SANITY_READ_TOKEN
const DOMAIN          = 'https://mixiartstudio.us'

// Páginas estáticas del sitio — mismas que tenía el sitemap.xml original.
const STATIC_PAGES = [
  { path: '/',                changefreq: 'weekly',  priority: '1.0' },
  { path: '/artists.html',    changefreq: 'weekly',  priority: '0.9' },
  { path: '/exhibitions.html', changefreq: 'weekly', priority: '0.9' },
  { path: '/shop.html',       changefreq: 'weekly',  priority: '0.9' },
  { path: '/projects.html',   changefreq: 'monthly', priority: '0.7' },
  { path: '/services.html',   changefreq: 'monthly', priority: '0.7' },
  { path: '/about.html',      changefreq: 'monthly', priority: '0.7' },
  { path: '/the-space.html',  changefreq: 'monthly', priority: '0.6' },
  { path: '/open-call.html',  changefreq: 'monthly', priority: '0.6' },
  { path: '/contact.html',    changefreq: 'monthly', priority: '0.5' },
]

async function fetchPublishedArtworks() {
  const query = encodeURIComponent(`
    *[_type == "artwork" && !(_id in path("drafts.**")) && defined(slug.current)]{
      "slug": slug.current, _updatedAt
    }
  `)
  const url = `https://${SANITY_PROJECT}.api.sanity.io/v2024-01-01/data/query/${SANITY_DATASET}?query=${query}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${SANITY_TOKEN}` } })
  if (!res.ok) throw new Error(`Sanity query failed: ${res.status}`)
  const json = await res.json()
  return json.result || []
}

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function urlEntry(loc, lastmod, changefreq, priority) {
  return `  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const today = new Date().toISOString().slice(0, 10)

  try {
    let artworks = []
    if (SANITY_PROJECT && SANITY_DATASET && SANITY_TOKEN) {
      artworks = await fetchPublishedArtworks()
    } else {
      console.error('[sitemap] Missing Sanity env vars — sitemap will only include static pages')
    }

    const entries = [
      ...STATIC_PAGES.map(p => urlEntry(`${DOMAIN}${p.path}`, today, p.changefreq, p.priority)),
      ...artworks.map(a => urlEntry(
        `${DOMAIN}/artwork.html?slug=${encodeURIComponent(a.slug)}`,
        (a._updatedAt || today).slice(0, 10),
        'weekly',
        '0.8'
      )),
    ]

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`

    res.setHeader('Content-Type', 'application/xml')
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).end(xml)
  } catch (err) {
    console.error('[sitemap] Error:', err.message)
    // Ante un error, servimos al menos las páginas estáticas — mejor un
    // sitemap incompleto que un sitemap.xml caído (500) para los crawlers.
    const fallback = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${STATIC_PAGES.map(p => urlEntry(`${DOMAIN}${p.path}`, today, p.changefreq, p.priority)).join('\n')}\n</urlset>\n`
    res.setHeader('Content-Type', 'application/xml')
    return res.status(200).end(fallback)
  }
}
