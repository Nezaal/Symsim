import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { getComponentType } from '@systemsim/engine'
import { categoryColor } from '../lib/categories.js'
import { formatPct } from '../lib/format.js'
import { STATUS, utilizationStatus } from '../lib/vizTokens.js'
import { useSimulationStore } from '../store/simulationStore.js'
import ComponentIcon from './ComponentIcon.jsx'

/**
 * Renders every node on the canvas. Which handles (connection dots) appear is
 * decided by the engine definition: a Client has no input and a database has
 * no output, so those connections can't even be started.
 *
 * During and after a run it also shows live utilization, and a red outline
 * plus a text badge on the bottleneck or on nodes with validation errors.
 *
 * @param {{ id: string, data: { componentType: string, label: string, config: object }, selected: boolean }} props
 */
function ComponentNode({ id, data, selected }) {
  const def = getComponentType(data.componentType)
  const summary = def.summary(data.config)
  const renamed = data.label !== def.label
  const color = categoryColor(def.category)
  const { utilization, flag } = useNodeSimulationState(id)
  const ring = flag
    ? 'border-red-500 ring-2 ring-red-500/60'
    : selected
      ? 'border-accent ring-1 ring-accent'
      : 'border-line'

  return (
    <div
      className={`relative w-44 rounded-md border border-l-4 bg-surface-2 px-3 py-2 shadow-md ${ring}`}
      style={{ borderLeftColor: color }}
    >
      {def.acceptsInput && <Handle type="target" position={Position.Left} />}
      {flag && (
        <span className="absolute -top-2.5 right-2 rounded bg-red-500 px-1.5 text-[10px] font-medium text-white">
          {flag}
        </span>
      )}

      <div className="flex items-center gap-1.5">
        <ComponentIcon type={data.componentType} size={14} color={color} />
        <span className="truncate text-sm font-medium text-ink">{data.label}</span>
      </div>
      <div className="truncate text-xs text-ink-muted">
        {renamed && `${def.label} · `}
        {summary}
      </div>

      {utilization !== undefined && def.type !== 'client' && <UtilizationBar value={utilization} />}

      {def.emitsOutput && <Handle type="source" position={Position.Right} />}
    </div>
  )
}

/** Thin status bar with the exact percentage in text (color is never the only cue). */
function UtilizationBar({ value }) {
  const status = utilizationStatus(value)
  return (
    <div className="mt-1.5 flex items-center gap-1.5" title={`Utilization ${formatPct(value)}`}>
      <div className="h-1 flex-1 rounded-full bg-line">
        <div
          className="h-1 rounded-full"
          style={{ width: `${Math.min(100, value * 100)}%`, backgroundColor: STATUS[status] }}
        />
      </div>
      <span className="w-10 text-right text-[10px] tabular-nums text-ink-muted">{formatPct(value)}</span>
    </div>
  )
}

/** Primitive selectors only, so a node re-renders only when its own values change. */
function useNodeSimulationState(id) {
  const utilization = useSimulationStore((s) => {
    if (s.status === 'idle' || s.status === 'invalid') return undefined
    if (s.result) return s.result.stations.find((st) => st.id === id)?.utilization
    return s.windows[s.windows.length - 1]?.stations[id]?.utilization
  })
  const flag = useSimulationStore((s) => {
    if (s.status === 'invalid' && s.errorNodeIds.includes(id)) return 'Fix me'
    if (s.result?.bottleneck?.nodeId === id) return 'Bottleneck'
    return null
  })
  return { utilization, flag }
}

// memo: React Flow re-renders on every viewport change; skip unchanged nodes.
export default memo(ComponentNode)
