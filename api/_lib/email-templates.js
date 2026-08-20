// /api/_lib/email-templates.js
// Plantillas HTML para los correos de confirmación de compra.
// Se usan tablas + estilos inline porque es lo único que se renderiza de forma
// consistente en Gmail, Outlook, Apple Mail, etc. (los <style> en <head> no son
// confiables en muchos clientes de correo).

const BLACK = '#0C0C0C'
const WHITE = '#F5F4F0'
const GRAY  = '#8A8A8A'
const LINE  = '#DDD9D2'

const SITE_URL = 'https://mixiartstudio.us'
const SUPPORT_EMAIL = 'info@mixiartstudio.us'
const INSTAGRAM_URL = 'https://instagram.com/mixi.art.studio'
const ADDRESS_LINE = '561 W 200 S, Suite 201, Salt Lake City, UT'

function money(cents, currency = 'usd') {
  if (typeof cents !== 'number' || isNaN(cents)) return ''
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

function esc(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function formatAddress(addr) {
  if (!addr) return ''
  const parts = [
    addr.line1,
    addr.line2,
    [addr.city, addr.state, addr.postal_code].filter(Boolean).join(', '),
    addr.country,
  ].filter(Boolean)
  return parts.map(esc).join('<br>')
}

// ── SHELL COMPARTIDO ─────────────────────────────────────────────────
function wrapEmail({ preheader, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mixi Art Studio</title>
</head>
<body style="margin:0;padding:0;background-color:${WHITE};font-family:Arial,Helvetica,sans-serif;">
<span style="display:none;font-size:1px;color:${WHITE};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${esc(preheader || '')}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${WHITE};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:${WHITE};">

<!-- HEADER -->
<tr><td style="padding:0 0 24px;border-bottom:2px solid ${BLACK};">
<a href="${SITE_URL}" style="text-decoration:none;color:${BLACK};font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:32px;letter-spacing:2px;">MIXI</a>
</td></tr>

${bodyHtml}

<!-- FOOTER -->
<tr><td style="padding:32px 0 0;border-top:1px solid ${LINE};margin-top:32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="padding-top:24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.7;color:${GRAY};">
<strong style="color:${BLACK};">Mixi Art Studio</strong><br>
${ADDRESS_LINE}<br>
<a href="mailto:${SUPPORT_EMAIL}" style="color:${GRAY};text-decoration:underline;">${SUPPORT_EMAIL}</a>
&nbsp;·&nbsp;
<a href="${INSTAGRAM_URL}" style="color:${GRAY};text-decoration:underline;">@mixi.art.studio</a>
</td>
</tr></table>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

// ── EMAIL 1: CONFIRMACIÓN AL CLIENTE ────────────────────────────────
export function customerConfirmationEmail(o) {
  const {
    artworkTitle, artistName, artworkSlug, mainImage,
    buyerName, shippingAddress,
    amountSubtotal, shippingAmount, amountTotal, currency,
    sizeTier, deliveryEstimate, sessionId,
  } = o

  const firstName = (buyerName || '').trim().split(' ')[0] || 'there'
  const artworkUrl = `${SITE_URL}/artwork.html?slug=${encodeURIComponent(artworkSlug || '')}`

  const imageBlock = mainImage
    ? `<tr><td style="padding:28px 0 0;">
         <img src="${esc(mainImage)}" alt="${esc(artworkTitle)}" width="200" style="display:block;width:200px;max-width:100%;height:auto;border:1px solid ${LINE};">
       </td></tr>`
    : ''

  const bodyHtml = `
<tr><td style="padding:32px 0 4px;">
<h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;color:${BLACK};letter-spacing:-.5px;">Thank you for your order, ${esc(firstName)}</h1>
</td></tr>
<tr><td style="padding:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:${BLACK};">
We're preparing <em>${esc(artworkTitle)}</em>${artistName ? ` by ${esc(artistName)}` : ''} for shipment. You'll receive a separate email with tracking information once your piece leaves our studio in Salt Lake City.
</td></tr>

${imageBlock}

<tr><td style="padding:20px 0 4px;">
<div style="font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:17px;color:${BLACK};">${esc(artworkTitle)}</div>
${artistName ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${GRAY};margin-top:2px;">${esc(artistName)}</div>` : ''}
</td></tr>

<!-- ORDER SUMMARY -->
<tr><td style="padding:20px 0 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${LINE};font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${BLACK};">
<tr>
<td style="padding:14px 0 6px;">Subtotal</td>
<td style="padding:14px 0 6px;text-align:right;">${money(amountSubtotal, currency)}</td>
</tr>
<tr>
<td style="padding:0 0 6px;">Shipping</td>
<td style="padding:0 0 6px;text-align:right;">${money(shippingAmount, currency)}</td>
</tr>
<tr>
<td style="padding:12px 0 0;border-top:1px solid ${LINE};font-weight:bold;">Total</td>
<td style="padding:12px 0 0;border-top:1px solid ${LINE};text-align:right;font-weight:bold;">${money(amountTotal, currency)}</td>
</tr>
</table>
</td></tr>

<!-- SHIPPING ADDRESS -->
${shippingAddress ? `
<tr><td style="padding:28px 0 0;">
<div style="font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${GRAY};margin-bottom:6px;">Shipping To</div>
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:${BLACK};">${formatAddress(shippingAddress)}</div>
</td></tr>` : ''}

${deliveryEstimate ? `
<tr><td style="padding:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${GRAY};">
Estimated delivery: ${esc(deliveryEstimate)}
</td></tr>` : ''}

<!-- CTA -->
<tr><td style="padding:28px 0 0;">
<a href="${artworkUrl}" style="display:inline-block;background-color:${BLACK};color:${WHITE};text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;padding:14px 28px;">View Artwork</a>
</td></tr>

<tr><td style="padding:28px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.7;color:${GRAY};">
This piece includes a Certificate of Authenticity. If you have any questions about your order, reply to this email or write to us at <a href="mailto:${SUPPORT_EMAIL}" style="color:${GRAY};">${SUPPORT_EMAIL}</a>.
${sessionId ? `<br><br>Order reference: ${esc(sessionId)}` : ''}
</td></tr>
`

  return {
    subject: `Your order confirmation — ${artworkTitle}`,
    html: wrapEmail({ preheader: `Your Mixi Art Studio order for "${artworkTitle}" is confirmed.`, bodyHtml }),
    text: `Thank you for your order, ${firstName}.\n\nWe're preparing "${artworkTitle}"${artistName ? ` by ${artistName}` : ''} for shipment.\n\nSubtotal: ${money(amountSubtotal, currency)}\nShipping: ${money(shippingAmount, currency)}\nTotal: ${money(amountTotal, currency)}\n\n${shippingAddress ? `Shipping to:\n${(shippingAddress.line1 || '')}\n${(shippingAddress.city || '')}, ${(shippingAddress.state || '')} ${(shippingAddress.postal_code || '')}\n${(shippingAddress.country || '')}\n\n` : ''}View your artwork: ${artworkUrl}\n\nQuestions? ${SUPPORT_EMAIL}`,
  }
}

// ── EMAIL 2: NOTIFICACIÓN INTERNA PARA MIXI ─────────────────────────
export function internalSaleNotificationEmail(o) {
  const {
    artworkTitle, artistName, artworkSlug, sizeTier,
    buyerName, buyerEmail, buyerPhone,
    shippingAddress, billingAddress,
    amountSubtotal, shippingAmount, amountTotal, currency,
    sessionId, paymentIntentId,
  } = o

  const studioUrl = `https://mixiartstudio.us/artwork.html?slug=${encodeURIComponent(artworkSlug || '')}`
  const stripeUrl = paymentIntentId ? `https://dashboard.stripe.com/payments/${paymentIntentId}` : null

  const row = (label, value) => value
    ? `<tr>
         <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${GRAY};width:140px;vertical-align:top;">${esc(label)}</td>
         <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${BLACK};">${value}</td>
       </tr>`
    : ''

  const bodyHtml = `
<tr><td style="padding:32px 0 4px;">
<h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;color:${BLACK};">New sale · ${money(amountTotal, currency)}</h1>
</td></tr>
<tr><td style="padding:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${BLACK};">
<em>${esc(artworkTitle)}</em>${artistName ? ` by ${esc(artistName)}` : ''} just sold. Time to pack and ship.
</td></tr>

<tr><td style="padding:24px 0 0;">
<div style="font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${GRAY};margin-bottom:8px;">Order</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${row('Artwork', `${esc(artworkTitle)} <a href="${studioUrl}" style="color:${GRAY};">(view)</a>`)}
${row('Artist', esc(artistName))}
${row('Size tier', esc(sizeTier))}
${row('Subtotal', money(amountSubtotal, currency))}
${row('Shipping', money(shippingAmount, currency))}
${row('Total paid', `<strong>${money(amountTotal, currency)}</strong>`)}
</table>
</td></tr>

<tr><td style="padding:24px 0 0;">
<div style="font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${GRAY};margin-bottom:8px;">Buyer</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${row('Name', esc(buyerName))}
${row('Email', `<a href="mailto:${esc(buyerEmail)}" style="color:${BLACK};">${esc(buyerEmail)}</a>`)}
${row('Phone', esc(buyerPhone))}
</table>
</td></tr>

${shippingAddress ? `
<tr><td style="padding:24px 0 0;">
<div style="font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${GRAY};margin-bottom:8px;">Ship To</div>
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:${BLACK};">${formatAddress(shippingAddress)}</div>
</td></tr>` : ''}

${billingAddress ? `
<tr><td style="padding:20px 0 0;">
<div style="font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${GRAY};margin-bottom:8px;">Billing Address</div>
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:${BLACK};">${formatAddress(billingAddress)}</div>
</td></tr>` : ''}

<tr><td style="padding:24px 0 0;">
<div style="font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${GRAY};margin-bottom:8px;">Reference</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${row('Session ID', esc(sessionId))}
${row('Stripe', stripeUrl ? `<a href="${stripeUrl}" style="color:${BLACK};">${esc(paymentIntentId)}</a>` : esc(paymentIntentId))}
</table>
</td></tr>

<tr><td style="padding:28px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${GRAY};">
The artwork has already been marked "Sold" in Sanity automatically.
</td></tr>
`

  return {
    subject: `New sale: ${artworkTitle} — ${money(amountTotal, currency)}`,
    html: wrapEmail({ preheader: `${artworkTitle} sold for ${money(amountTotal, currency)}.`, bodyHtml }),
    text: `New sale: ${artworkTitle}${artistName ? ` by ${artistName}` : ''}\nTotal: ${money(amountTotal, currency)}\n\nBuyer: ${buyerName || ''} <${buyerEmail || ''}>${buyerPhone ? ` · ${buyerPhone}` : ''}\n\n${shippingAddress ? `Ship to:\n${shippingAddress.line1 || ''}\n${shippingAddress.city || ''}, ${shippingAddress.state || ''} ${shippingAddress.postal_code || ''}\n${shippingAddress.country || ''}\n\n` : ''}Session: ${sessionId || ''}\nPayment intent: ${paymentIntentId || ''}`,
  }
}

// ── EMAIL 3: RESUMEN SEMANAL (inquiries pendientes + obras más vistas) ──
export function weeklyDigestEmail(o) {
  const { weekLabel, staleInquiries = [], mostViewed = [], isFirstRun = false } = o

  const inquiryRow = (inq) => {
    const artworkLabel = inq.artworkTitle
      ? `${esc(inq.artworkTitle)}${inq.artistName ? ` (${esc(inq.artistName)})` : ''}`
      : 'General inquiry'
    const artworkLink = inq.artworkSlug
      ? `${SITE_URL}/artwork.html?slug=${encodeURIComponent(inq.artworkSlug)}`
      : null
    return `
<tr><td style="padding:16px 0;border-top:1px solid ${LINE};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:${BLACK};">${esc(inq.name)}</td>
<td style="text-align:right;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${GRAY};">${inq.daysAgo}d ago</td>
</tr>
</table>
<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${GRAY};margin-top:2px;">
<a href="mailto:${esc(inq.email)}" style="color:${GRAY};">${esc(inq.email)}</a>${inq.phone ? ` · ${esc(inq.phone)}` : ''}
</div>
<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${BLACK};margin-top:6px;">
${artworkLink ? `<a href="${artworkLink}" style="color:${BLACK};">${artworkLabel}</a>` : artworkLabel}
</div>
${inq.message ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${GRAY};margin-top:6px;font-style:italic;">"${esc(inq.message).slice(0, 160)}${inq.message.length > 160 ? '…' : ''}"</div>` : ''}
</td></tr>`
  }

  const viewedRow = (a, i) => {
    const url = `${SITE_URL}/artwork.html?slug=${encodeURIComponent(a.slug || '')}`
    return `
<tr>
<td style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${GRAY};width:20px;">${i + 1}.</td>
<td style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${BLACK};">
<a href="${url}" style="color:${BLACK};text-decoration:none;">${esc(a.title)}</a>${a.artistName ? `<span style="color:${GRAY};"> — ${esc(a.artistName)}</span>` : ''}
</td>
<td style="padding:8px 0;text-align:right;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${GRAY};white-space:nowrap;">${a.delta} view${a.delta === 1 ? '' : 's'}</td>
</tr>`
  }

  const inquiriesSection = staleInquiries.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${staleInquiries.map(inquiryRow).join('')}</table>`
    : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${GRAY};padding:12px 0;">No inquiries older than 3 days without a reply — nice work.</div>`

  const viewedSection = isFirstRun
    ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${GRAY};padding:12px 0;">This is the first digest, so there's no prior week to compare against yet — next week's email will show view trends.</div>`
    : mostViewed.length
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${mostViewed.map(viewedRow).join('')}</table>`
      : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${GRAY};padding:12px 0;">No new artwork views recorded this week.</div>`

  const bodyHtml = `
<tr><td style="padding:32px 0 4px;">
<h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;color:${BLACK};">Weekly digest</h1>
</td></tr>
<tr><td style="padding:4px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${GRAY};">
${esc(weekLabel)}
</td></tr>

<tr><td style="padding:28px 0 0;">
<div style="font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${GRAY};margin-bottom:4px;">Needs a reply (3+ days old)</div>
${inquiriesSection}
</td></tr>

<tr><td style="padding:28px 0 0;">
<div style="font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${GRAY};margin-bottom:8px;">Most viewed this week</div>
${viewedSection}
</td></tr>

<tr><td style="padding:28px 0 0;">
<a href="${SITE_URL}/shop.html" style="display:inline-block;background-color:${BLACK};color:${WHITE};text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;padding:14px 28px;">View Shop</a>
</td></tr>
`

  const textInquiries = staleInquiries.length
    ? staleInquiries.map(i => `- ${i.name} <${i.email}> (${i.daysAgo}d ago) — ${i.artworkTitle || 'General inquiry'}`).join('\n')
    : 'No inquiries older than 3 days without a reply.'
  const textViewed = isFirstRun
    ? 'First digest — no comparison yet.'
    : (mostViewed.length ? mostViewed.map((a, i) => `${i + 1}. ${a.title}${a.artistName ? ` — ${a.artistName}` : ''} (${a.delta} views)`).join('\n') : 'No new views this week.')

  return {
    subject: `Weekly digest — ${weekLabel}`,
    html: wrapEmail({ preheader: `${staleInquiries.length} inquiries need a reply.`, bodyHtml }),
    text: `Weekly digest — ${weekLabel}\n\nNeeds a reply (3+ days old):\n${textInquiries}\n\nMost viewed this week:\n${textViewed}`,
  }
}
