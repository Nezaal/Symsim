import { useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import Toolbar from './components/Toolbar.jsx'
import Palette from './components/Palette.jsx'
import CanvasArea from './components/CanvasArea.jsx'
import ConfigPanel from './components/ConfigPanel.jsx'
import MetricsDrawer from './components/MetricsDrawer.jsx'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js'

/**
 * App shell: a grid of five regions.
 *
 *   ┌──────────── Toolbar ────────────┐
 *   │ Palette │  Canvas     │ Config  │
 *   │         ├─────────────┤ Panel   │
 *   │         │  Metrics    │         │
 *   └─────────┴─────────────┴─────────┘
 *
 * The canvas gets all leftover space (`flex-1` / `min-w-0`), which is the
 * "canvas first" rule from the spec.
 *
 * ReactFlowProvider wraps everything so components outside the canvas (the
 * palette's click-to-add) can use React Flow hooks such as useReactFlow().
 */
function App() {
  const [paletteOpen, setPaletteOpen] = useState(true)
  const [metricsOpen, setMetricsOpen] = useState(true)
  useKeyboardShortcuts()

  return (
    <ReactFlowProvider>
      <div className="flex h-full flex-col">
        <Toolbar
          onTogglePalette={() => setPaletteOpen((open) => !open)}
          onToggleMetrics={() => setMetricsOpen((open) => !open)}
        />
        <div className="flex min-h-0 flex-1">
          <Palette open={paletteOpen} />
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
