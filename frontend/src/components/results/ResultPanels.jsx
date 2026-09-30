import { AlertTriangle, CheckCircle2, Gauge } from 'lucide-react'
import { formatInt, formatMs, formatPct, formatRps } from '../../lib/format.js'
import { STATUS, utilizationStatus } from '../../lib/vizTokens.js'

const STATUS_LABEL = { good: 'OK', warning: 'Busy', critical: 'Saturated' }

/** Headline numbers. Values in text ink; no chart needed for single numbers. */
export function KpiTiles({ totals, result }) {
  const tiles = result
    ? [
        ['Throughput', formatRps(result.throughputRps)],
        ['p50 latency', formatMs(result.latencyP50Ms)],
        ['p95 latency', formatMs(result.latencyP95Ms)],
        ['p99 latency', formatMs(result.latencyP99Ms)],
        ['Error rate', formatPct(result.errorRate)],
        ['Requests', formatInt(result.totalRequests)],
      ]
    : [
        ['Requests', formatInt(totals?.total)],
        ['Succeeded', formatInt(totals?.ok)],
        ['Rejected', formatInt(totals?.rejected)],
        ['Timed out', formatInt(totals?.timedOut)],
      ]

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-line bg-surface px-3 py-2">
          <dt className="text-xs text-ink-muted">{label}</dt>
          <dd className="text-lg font-semibold tabular-nums text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Verdict plus the bottleneck explanation, with an icon and a label (never color alone). */
export function Verdict({ result }) {
  const bottleneck = result.bottleneck
  const status = !bottleneck ? 'good' : bottleneck.severity === 'saturated' ? 'critical' : 'warning'
  const Icon = status === 'good' ? CheckCircle2 : AlertTriangle

  return (
    <div className="space-y-1.5 rounded-lg border border-line bg-surface p-4">
      <p className="flex items-start gap-1.5 text-sm font-medium text-ink">
        <Icon size={16} color={STATUS[status]} className="mt-0.5 shrink-0" aria-hidden="true" />
        {result.summary}
      </p>
      {bottleneck && <p className="text-sm leading-relaxed text-ink-muted">{bottleneck.explanation}</p>}
      {bottleneck?.alsoSaturated.length > 0 && (
        <p className="text-xs text-ink-muted">Also saturated: {bottleneck.alsoSaturated.join(', ')}.</p>
      )}
    </div>
  )
}

/**
 * Per-component utilization as horizontal bars: magnitude on a common scale,
 * status color plus a text label and the exact percentage.
 */
export function UtilizationList({ rows }) {
  return (
    <div>
      <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
        <Gauge size={13} aria-hidden="true" /> Utilization
      </h3>
      <ul className="space-y-1.5">
        {rows.map((row) => {
          const status = utilizationStatus(row.utilization)
          const width = Math.min(100, row.utilization * 100)
          return (
            <li key={row.id} title={`${row.label}: ${formatPct(row.utilization)} (${STATUS_LABEL[status]})`}>
              <div className="flex justify-between text-xs">
                <span className="truncate text-ink">{row.label}</span>
                <span className="shrink-0 tabular-nums text-ink-muted">
                  {formatPct(row.utilization)} · {STATUS_LABEL[status]}
                </span>
              </div>
              <div className="mt-0.5 h-1.5 rounded-full bg-line">
                <div className="h-1.5 rounded-full" style={{ width: `${width}%`, backgroundColor: STATUS[status] }} />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
