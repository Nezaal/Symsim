// Placeholder list. In milestone 2 this comes from engine/componentTypes.js,
// the single source of truth shared by the UI and the simulation engine.
const PLACEHOLDER_TYPES = ['Client', 'Load Balancer', 'App Server', 'Cache', 'Database']

/**
 * Left sidebar with the components you can drag onto the canvas.
 * @param {{ open: boolean }} props
 */
function Palette({ open }) {
  if (!open) return null

  return (
    <aside className="w-56 shrink-0 overflow-y-auto border-r border-line bg-surface p-3">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
        Components
      </h2>
      <ul className="space-y-1.5">
        {PLACEHOLDER_TYPES.map((label) => (
          <li
            key={label}
            className="rounded-md border border-line bg-surface-2 px-3 py-2 text-sm"
          >
            {label}
          </li>
        ))}
      </ul>
    </aside>
  )
}

export default Palette
