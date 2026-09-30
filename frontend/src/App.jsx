import { useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import Toolbar from './components/Toolbar.jsx'
import CanvasArea from './components/CanvasArea.jsx'
import ConfigPanel from './components/ConfigPanel.jsx'
import MetricsDrawer from './components/MetricsDrawer.jsx'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js'

/**
 * App shell: toolbar, canvas, config panel, metrics drawer.
 *
 *   ┌──────────── Toolbar ──────────────┐
 *   │ [☰]                     │ Config  │
 *   │        Canvas           │ Panel   │
 *   ├─────────────────────────┤         │
 *   │        Metrics          │         │
 *   └─────────────────────────┴─────────┘
 *
 * The component menu (☰) floats over the canvas; see ComponentMenu.jsx.
 *
 * The canvas gets all leftover space (`flex-1` / `min-w-0`), which is the
 * "canvas first" rule from the spec.
 *
 * ReactFlowProvider wraps everything so components outside the canvas (the
 * toolbar's Templates menu) can use React Flow hooks such as useReactFlow().
 */
function App() {
  const [metricsOpen, setMetricsOpen] = useState(true)
  useKeyboardShortcuts()

  return (
    <ReactFlowProvider>
      <div className="flex h-full flex-col">
        <Toolbar onToggleMetrics={() => setMetricsOpen((open) => !open)} />
        <div className="flex min-h-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col">
            <CanvasArea />
            <MetricsDrawer open={metricsOpen} />
          </main>
          <ConfigPanel />
        </div>
      </div>
    </ReactFlowProvider>
  )
}

export default App
