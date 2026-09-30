import { useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import Toolbar from './components/Toolbar.jsx'
import CanvasArea from './components/CanvasArea.jsx'
import MetricsDrawer from './components/MetricsDrawer.jsx'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js'

/**
 * App shell: a slim toolbar, then the canvas taking all remaining space.
 *
 *   ┌──────────────── Toolbar ─────────────────┐
 *   │ [☰]                        ┌ settings ┐  │
 *   │ ┌ menu ┐     Canvas        │ (only    │  │
 *   │ └──────┘                   │ when a   │  │
 *   │                            │ component│  │
 *   │                            │ is       │  │
 *   │                            │ selected)│  │
 *   │ [− 100% + ⛶][↶ ↷]         └──────────┘  │
 *   ├──────────────────────────────────────────┤
 *   │ Results drawer (slides up after Run)     │
 *   └──────────────────────────────────────────┘
 *
 * Everything on the canvas floats (React Flow <Panel>s, see CanvasArea.jsx),
 * so the canvas itself is never squeezed by side columns.
 *
 * ReactFlowProvider wraps everything so components outside the canvas (the
 * toolbar's Templates menu) can use React Flow hooks such as useReactFlow().
 */
function App() {
  // Local for now; moves into a simulation store when the engine phase adds Run.
  const [resultsOpen, setResultsOpen] = useState(false)
  useKeyboardShortcuts()

  return (
    <ReactFlowProvider>
      <div className="flex h-full flex-col">
        <Toolbar onRun={() => setResultsOpen(true)} />
        <main className="flex min-h-0 flex-1 flex-col">
          <CanvasArea />
          <MetricsDrawer open={resultsOpen} onClose={() => setResultsOpen(false)} />
        </main>
      </div>
    </ReactFlowProvider>
  )
}

export default App
