const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const oneDecimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

export const formatInt = (n) => numberFormat.format(Math.round(n ?? 0))

/** 0.4 ms, 12.3 ms, 1,204 ms, 3.2 s */
export function formatMs(ms) {
  if (!Number.isFinite(ms)) return '–'
  if (ms >= 10_000) return `${oneDecimal.format(ms / 1000)} s`
  if (ms >= 100) return `${numberFormat.format(ms)} ms`
  return `${oneDecimal.format(ms)} ms`
}

/** 0..1 → "12.5%" */
export const formatPct = (fraction) => `${oneDecimal.format((fraction ?? 0) * 100)}%`

export const formatRps = (rps) => `${formatInt(rps)} req/s`
