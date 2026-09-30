import { ReactFlowProvider } from '@xyflow/react'
import Toolbar from './components/Toolbar.jsx'
import CanvasArea from './components/CanvasArea.jsx'
import ResultsOverlay from './components/results/ResultsOverlay.jsx'
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
 *   │ [− 100% + ⛶ 🗺][↶ ↷]      └──────────┘  │
 *   └──────────────────────────────────────────┘
 *
 * Results open as a full-page overlay on top of all this (ResultsOverlay.jsx).
 *
 * Everything on the canvas floats (React Flow <Panel>s, see CanvasArea.jsx),
 * so the canvas itself is never squeezed by side columns.
 *
 * ReactFlowProvider wraps everything so components outside the canvas (the
 * toolbar's Templates menu) can use React Flow hooks such as useReactFlow().
 */
function App() {
  useKeyboardShortcuts()

  return (
    <ReactFlowProvider>
      <div className="flex h-full flex-col">
        <Toolbar />
        <main className="flex min-h-0 flex-1 flex-col">
          <CanvasArea />
        </main>
      </div>
      <ResultsOverlay />
    </ReactFlowProvider>
  )
}

export default App
