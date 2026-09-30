import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Background, Controls, MarkerType, ReactFlow, ReactFlowProvider } from '@xyflow/react'
import { Copy } from 'lucide-react'
import ComponentNode from '../components/ComponentNode.jsx'
import { projectsApi } from '../lib/projectsApi.js'
import { deserializeGraph } from '../lib/graphSnapshot.js'
import { useArchitectureStore } from '../store/architectureStore.js'
import { useProjectStore } from '../store/projectStore.js'
import { saveDraft } from '../lib/draftStorage.js'

const nodeTypes = { component: ComponentNode }
const defaultEdgeOptions = { type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } }
const PRO_OPTIONS = { hideAttribution: true }
const FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: 1 }

/** Read-only view of a shared version (/s/:token). Works without signing in. */
function SharedPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    projectsApi
      .getSharedVersion(token)
      .then((shared) => {
        if (cancelled) return
        if (!shared) return setState({ status: 'missing' })
        setState({ status: 'ready', shared, graph: deserializeGraph(shared.graph) })
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', message: error.message })
      })
    return () => {
      cancelled = true
    }
  }, [token])

  /** Copies the design into the editor as a new, unsaved design (the original is untouched). */
  const openCopy = () => {
    const hasWork = useArchitectureStore.getState().nodes.length > 0
    if (hasWork && !window.confirm('Replace the design currently open in your editor with this copy?')) return
    useProjectStore.getState().reset()
    useArchitectureStore.getState().replaceGraph(state.graph.nodes, state.graph.edges)
    // Write the draft now, so a refresh before the first edit keeps the copy.
    saveDraft({ nodes: state.graph.nodes, edges: state.graph.edges })
    navigate('/app')
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
        <Link to="/" className="text-sm font-semibold tracking-tight hover:text-accent">
          SystemSim
        </Link>
        {state.status === 'ready' && (
          <>
            <span className="h-5 w-px bg-line" aria-hidden="true" />
            <span className="truncate text-sm text-ink">{state.shared.project_name}</span>
            <span className="text-xs text-ink-muted">v{state.shared.version_number} · read-only</span>
            <button
              type="button"
              onClick={openCopy}
              className="ml-auto flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
            >
              <Copy size={14} aria-hidden="true" /> Open a copy in the editor
            </button>
          </>
        )}
      </header>

      <main className="relative min-h-0 flex-1">
        {state.status === 'loading' && <Centered>Loading shared design…</Centered>}
        {state.status === 'missing' && (
          <Centered>
            This link is invalid, has expired, or was turned off by its owner.{' '}
            <Link to="/app" className="text-accent underline">
              Open the editor
            </Link>
          </Centered>
        )}
        {state.status === 'error' && <Centered>{state.message}</Centered>}
        {state.status === 'ready' && (
          <ReactFlowProvider>
            <ReactFlow
              nodes={state.graph.nodes}
              edges={state.graph.edges}
              nodeTypes={nodeTypes}
              defaultEdgeOptions={defaultEdgeOptions}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              deleteKeyCode={null}
              fitView
              fitViewOptions={FIT_VIEW_OPTIONS}
              proOptions={PRO_OPTIONS}
              colorMode="dark"
            >
              <Background gap={16} />
              <Controls showInteractive={false} />
            </ReactFlow>
            {state.shared.message && (
              <p className="absolute left-3 top-3 max-w-md rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink-muted">
                “{state.shared.message}”
              </p>
            )}
          </ReactFlowProvider>
        )}
      </main>
    </div>
  )
}

function Centered({ children }) {
  return <p className="flex h-full items-center justify-center p-6 text-center text-sm text-ink-muted">{children}</p>
}

export default SharedPage
