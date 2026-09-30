import { useMemo } from 'react'
import { X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useSimulationStore } from '../store/simulationStore.js'
import { useArchitectureStore } from '../store/architectureStore.js'
import { formatMs, formatRps } from '../lib/format.js'
import { SERIES } from '../lib/vizTokens.js'
import TimeSeriesChart from './results/TimeSeriesChart.jsx'
import { KpiTiles, UtilizationList, Verdict } from './results/ResultPanels.jsx'

const STATUS_TEXT = {
  running: 'Running…',
  paused: 'Paused',
  done: 'Finished',
  stopped: 'Stopped',
  invalid: 'Fix these before running',
  error: 'Simulation error',
}

const LATENCY_SERIES = [
  { key: 'p50Ms', label: 'p50', color: SERIES[0] },
  { key: 'p95Ms', label: 'p95', color: SERIES[1] },
  { key: 'p99Ms', label: 'p99', color: SERIES[2] },
]
const THROUGHPUT_SERIES = [{ key: 'throughputRps', label: 'Throughput', color: SERIES[0] }]

/**
 * Bottom drawer with live results. Hidden (zero height) until a run starts;
 * it slides up and the canvas shrinks above it, so nothing is covered.
 * `inert` while closed keeps its buttons out of the Tab order.
 */
function MetricsDrawer() {
  const { status, drawerOpen, closeDrawer, progress, windows, result, errors, errorMessage } = useSimulationStore(
    useShallow((s) => ({
      status: s.status,
      drawerOpen: s.drawerOpen,
      closeDrawer: s.closeDrawer,
      progress: s.progress,
      windows: s.windows,
      result: s.result,
      errors: s.errors,
      errorMessage: s.errorMessage,
    })),
  )

  return (
    <section
      aria-label="Simulation results"
      inert={!drawerOpen}
      className={`flex shrink-0 flex-col overflow-hidden bg-surface transition-[height] duration-200 ease-out ${
        drawerOpen ? 'h-80 border-t border-line' : 'h-0'
      }`}
    >
      <header className="flex items-center gap-3 px-3 pt-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-muted">Simulation</h2>
        <span className="text-xs text-ink-muted" aria-live="polite">
          {STATUS_TEXT[status] ?? ''}
        </span>
        {progress && (status === 'running' || status === 'paused') && (
          <div
            className="h-1 w-40 rounded-full bg-line"
            role="progressbar"
            aria-valuenow={Math.round(progress.fraction * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-1 rounded-full bg-accent" style={{ width: `${progress.fraction * 100}%` }} />
          </div>
        )}
        <button
          type="button"
          onClick={closeDrawer}
          aria-label="Close results"
          className="ml-auto rounded-md p-1 text-ink-muted hover:bg-surface-2 hover:text-ink"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {status === 'invalid' && <ErrorList errors={errors} />}
        {status === 'error' && <p className="text-sm text-red-400">{errorMessage}</p>}
        {status !== 'invalid' && status !== 'error' && (
          <ResultsBody windows={windows} progress={progress} result={result} />
        )}
      </div>
    </section>
  )
}

function ResultsBody({ windows, progress, result }) {
  const utilizationRows = useUtilizationRows(windows, result)

  if (windows.length === 0 && !result) {
    return <p className="text-sm text-ink-muted">Starting simulation…</p>
  }

  return (
    <div className="flex h-full min-h-60 gap-4">
      <div className="flex w-64 shrink-0 flex-col gap-2 overflow-y-auto">
        <KpiTiles totals={progress?.totals} result={result} />
        {result && <Verdict result={result} />}
      </div>
      <TimeSeriesChart title="Throughput (successful req/s)" data={windows} series={THROUGHPUT_SERIES} formatValue={formatRps} />
      <TimeSeriesChart title="Latency of successful requests" data={windows} series={LATENCY_SERIES} formatValue={formatMs} />
      <div className="w-56 shrink-0 overflow-y-auto">
        <UtilizationList rows={utilizationRows} />
      </div>
    </div>
  )
}

/** Final totals when finished, otherwise the latest one-second sample. */
function useUtilizationRows(windows, result) {
  const nodes = useArchitectureStore((s) => s.nodes)
  const latest = windows[windows.length - 1]
  return useMemo(() => {
    if (result) {
      return result.stations
        .filter((s) => s.type !== 'client')
        .map((s) => ({ id: s.id, label: s.label, utilization: s.utilization }))
        .sort((a, b) => b.utilization - a.utilization)
    }
    if (!latest) return []
    const labels = new Map(nodes.map((n) => [n.id, n]))
    return Object.entries(latest.stations)
      .filter(([id]) => labels.get(id)?.data.componentType !== 'client')
      .map(([id, sample]) => ({ id, label: labels.get(id)?.data.label ?? id, utilization: sample.utilization }))
      .sort((a, b) => b.utilization - a.utilization)
  }, [result, latest, nodes])
}

function ErrorList({ errors }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
      {errors.map((e, i) => (
        <li key={`${e.nodeId ?? 'general'}-${i}`}>{e.message}</li>
      ))}
    </ul>
  )
}

export default MetricsDrawer
