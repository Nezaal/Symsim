import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { getComponentType } from '@systemsim/engine'
import { categoryColor } from '../lib/categories.js'
import ComponentIcon from './ComponentIcon.jsx'

/**
 * Renders every node on the canvas. Which handles (connection dots) appear is
 * decided by the engine definition: a Client has no input and a database has
 * no output, so those connections can't even be started.
 *
 * @param {{ data: { componentType: string, label: string, config: object }, selected: boolean }} props
 */
function ComponentNode({ data, selected }) {
  const def = getComponentType(data.componentType)
  const summary = def.summary(data.config)
  const renamed = data.label !== def.label
  const color = categoryColor(def.category)

  return (
    <div
      className={`w-44 rounded-md border border-l-4 bg-surface-2 px-3 py-2 shadow-md ${
        selected ? 'border-accent ring-1 ring-accent' : 'border-line'
      }`}
      style={{ borderLeftColor: color }}
    >
      {def.acceptsInput && <Handle type="target" position={Position.Left} />}

      <div className="flex items-center gap-1.5">
        <ComponentIcon type={data.componentType} size={14} color={color} />
        <span className="truncate text-sm font-medium text-ink">{data.label}</span>
      </div>
      <div className="truncate text-xs text-ink-muted">
        {renamed && `${def.label} · `}
        {summary}
      </div>

      {def.emitsOutput && <Handle type="source" position={Position.Right} />}
    </div>
  )
}

// memo: React Flow re-renders on every viewport change; skip unchanged nodes.
export default memo(ComponentNode)
