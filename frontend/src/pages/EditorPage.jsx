import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useMatch, useSearchParams } from 'react-router'
import { useAuthStore } from '../store/authStore.js'
import Toolbar from '../components/Toolbar.jsx'
import CanvasArea from '../components/CanvasArea.jsx'
import ResultsOverlay from '../components/results/ResultsOverlay.jsx'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js'
import { useEditorSession } from '../hooks/useEditorSession.js'
import SaveDialog from '../components/project/SaveDialog.jsx'

/**
 * The editor (/app): a slim toolbar, then the canvas taking all remaining space.
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
function EditorPage() {
  const projectId = useMatch('/app/p/:projectId')?.params.projectId
  useKeyboardShortcuts()
  useOpenSignInFromUrl()
  useEditorSession(projectId ?? null)

  return (
    <ReactFlowProvider>
      <div className="flex h-full flex-col">
        <Toolbar />
        <main className="flex min-h-0 flex-1 flex-col">
          <CanvasArea />
        </main>
      </div>
      <ResultsOverlay />
      <SaveDialog />
    </ReactFlowProvider>
  )
}

/** The landing page links to /app?signin=1: open the dialog, then tidy the URL. */
function useOpenSignInFromUrl() {
  const [params, setParams] = useSearchParams()
  const openSignIn = useAuthStore((s) => s.openSignIn)
  const status = useAuthStore((s) => s.status)
  useEffect(() => {
    if (params.get('signin') !== '1' || status === 'loading') return
    if (status === 'signedOut') openSignIn()
    setParams({}, { replace: true })
  }, [params, setParams, openSignIn, status])
}

export default EditorPage
