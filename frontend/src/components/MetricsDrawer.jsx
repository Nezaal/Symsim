/**
 * Bottom drawer for live simulation charts (milestone 6).
 * @param {{ open: boolean }} props
 */
function MetricsDrawer({ open }) {
  if (!open) return null

  return (
    <section className="h-56 shrink-0 border-t border-line bg-surface p-3">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
        Metrics
      </h2>
      <p className="text-sm text-ink-muted">Run a simulation to see throughput and latency.</p>
    </section>
  )
}

export default MetricsDrawer
