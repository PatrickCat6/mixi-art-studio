// /api/_lib/origin.js
// Resuelve desde qué ciudad/país sale físicamente una obra, según dónde vive y
// trabaja el artista (campo `basedIn` del documento Artist en Sanity), con
// respaldo en `nationality` si basedIn falta o no es reconocible.
//
// Antes el pipeline asumía que TODO salía de Salt Lake City. Ahora: los
// artistas mexicanos envían desde México, los artistas en USA desde USA, y
// los artistas en Europa desde Europa — según dónde estén basados hoy, no
// necesariamente su país de origen (ej. un artista mexicano radicado en Salt
// Lake City envía desde Salt Lake City).

const COUNTRY_NAMES = { US: 'the United States', MX: 'Mexico', EU: 'Europe' }

// Estudio base de Mixi — respaldo cuando no hay datos suficientes del artista
// (basedIn y nationality vacíos, "Not provided", o formato irreconocible).
const DEFAULT_ORIGIN = { bucket: 'US', country: 'US', city: 'Salt Lake City', label: 'Salt Lake City, Utah' }

const EU_HINTS = [
  'spain', 'spanish', 'france', 'french', 'italy', 'italian', 'germany', 'german',
  'portugal', 'portuguese', 'united kingdom', 'uk', 'england', 'netherlands', 'dutch',
  'belgium', 'switzerland', 'austria', 'greece', 'ireland', 'poland', 'sweden',
  'norway', 'denmark', 'finland', 'europe', 'european',
]

function bucketFromText(text) {
  if (!text) return null
  const s = text.toLowerCase()
  if (s.includes('not provided')) return null
  if (s.includes('/')) return null // nacionalidad doble ("USA/Mexican") — ambiguo, no adivinamos
  if (/\bmx\b/.test(s) || s.includes('mexic')) return 'MX'
  if (/\bus\b/.test(s) || s.includes('usa') || s.includes('united states') || s.includes('american')) return 'US'
  if (EU_HINTS.some(h => s.includes(h))) return 'EU'
  return null
}

function cityFromBasedIn(basedIn) {
  if (!basedIn || /not provided/i.test(basedIn)) return null
  const first = basedIn.split(',')[0]?.trim()
  return first || null
}

// artist: { basedIn, nationality } — normalmente traído de Sanity vía
// `"artistBasedIn": artist->basedIn, "artistNationality": artist->nationality`.
export function resolveOrigin(artist) {
  const basedIn = artist?.basedIn || ''
  const nationality = artist?.nationality || ''

  let bucket = bucketFromText(basedIn)
  let city = bucket ? cityFromBasedIn(basedIn) : null

  if (!bucket) {
    // basedIn ausente, "Not provided", o formato no reconocible — usamos
    // nacionalidad como respaldo (sin ciudad específica en ese caso).
    bucket = bucketFromText(nationality)
    city = null
  }

  if (!bucket) {
    console.warn(`[origin] No se pudo determinar el origen de envío (basedIn="${basedIn}", nationality="${nationality}") — usando Salt Lake City por defecto`)
    return DEFAULT_ORIGIN
  }

  const label = city || COUNTRY_NAMES[bucket]
  return { bucket, country: bucket, city, label }
}

const NORTH_AMERICA = new Set(['US', 'MX'])

function destBucket(countryCode) {
  if (!countryCode) return null
  if (countryCode === 'US') return 'US'
  if (countryCode === 'MX') return 'MX'
  return 'EU' // cajón genérico para cualquier destino fuera de Norteamérica
}

// originBucket viene de resolveOrigin().bucket ('US' | 'MX' | 'EU').
// destCountryCode es el código ISO de 2 letras del shipping address (Stripe).
export function deliveryEstimateFor(originBucket, destCountryCode) {
  const dest = destBucket(destCountryCode)
  if (!dest) return ''
  if (dest === originBucket) return '5–10 business days'
  if (NORTH_AMERICA.has(originBucket) && NORTH_AMERICA.has(dest)) return '7–14 business days'
  return '12–24 business days'
}
