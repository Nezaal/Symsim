import { useCallback, useState } from 'react'
import { Background, MarkerType, MiniMap, ReactFlow, useReactFlow } from '@xyflow/react'
import { useShallow } from 'zustand/react/shallow'
import { connectionError, findComponentType } from '@systemsim/engine'
import { useArchitectureStore } from '../store/architectureStore.js'
import { useSimulationStore } from '../store/simulationStore.js'
import { categoryColor } from '../lib/categories.js'
import { COMPONENT_DRAG_MIME } from '../lib/dragAndDrop.js'
import ComponentNode from './ComponentNode.jsx'
import TemplatePicker from './TemplatePicker.jsx'
import ComponentMenu from './ComponentMenu.jsx'
import ConfigPanel from './ConfigPanel.jsx'
import CanvasControls from './CanvasControls.jsx'

// Defined outside the component so React Flow sees the same object every render.
const nodeTypes = { component: ComponentNode }
const defaultEdgeOptions = { type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } }
const DELETE_KEYS = ['Delete', 'Backspace']
// React Flow is MIT-licensed; hiding the attribution link is permitted.
const PRO_OPTIONS = { hideAttribution: true }

const minimapColor = (node) =>
  categoryColor(findComponentType(node.data.componentType)?.category)

// Reads the latest graph straight from the store, so this callback never goes stale.
const isValidConnection = (connection) => {
  const { nodes, edges } = useArchitectureStore.getState()
  return connectionError(connection, nodes, edges) === null
}

function CanvasArea() {
  const [showMinimap, setShowMinimap] = useState(false)
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, snapshot, addNode } =
    useArchitectureStore(
      useShallow((s) => ({
        nodes: s.nodes,
        edges: s.edges,
        onNodesChange: s.onNodesChange,
        onEdgesChange: s.onEdgesChange,
        onConnect: s.onConnect,
        snapshot: s.snapshot,
        addNode: s.addNode,
      })),
    )
  const { screenToFlowPosition } = useReactFlow()
  // While results cover the page, keys must not edit the hidden canvas.
  const resultsOpen = useSimulationStore((s) => s.drawerOpen)

  // Keyboard deletes arrive as several change events; snapshot once up front
  // so the whole delete is a single undo step.
  const onBeforeDelete = useCallback(async () => {
    snapshot()
    return true
  }, [snapshot])

  const onDragOver = useCallback((event) => {
    if (!event.dataTransfer.types.includes(COMPONENT_DRAG_MIME)) return
    event.preventDefault() // required, or the browser refuses the drop
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event) => {
      const type = event.dataTransfer.getData(COMPONENT_DRAG_MIME)
      if (!findComponentType(type)) return
      event.preventDefault()
      // Mouse position is in screen pixels; the canvas may be panned and zoomed.
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      addNode(type, position)
    },
    [screenToFlowPosition, addNode],
  )

  return (
    <section className="relative min-h-0 flex-1" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        // Also fires for multi-selection drags (xyflow calls it before onSelectionDragStart),
        // so this one handler gives exactly one undo step per drag.
        onNodeDragStart={snapshot}
        onBeforeDelete={onBeforeDelete}
        deleteKeyCode={resultsOpen ? null : DELETE_KEYS}
        proOptions={PRO_OPTIONS}
        colorMode="dark"
      >
        <Background gap={16} />
        {showMinimap && <MiniMap nodeColor={minimapColor} pannable zoomable />}
        {/* Floating panels: top-left menu, top-right settings, bottom-left controls. */}
        <ComponentMenu />
        <ConfigPanel minimapVisible={showMinimap} />
        <CanvasControls
          minimapVisible={showMinimap}
          onToggleMinimap={() => setShowMinimap((shown) => !shown)}
        />
      </ReactFlow>

      {nodes.length === 0 && (
        // The overlay lets clicks/drops pass through to the canvas; only the cards catch them.
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="pointer-events-auto w-full max-w-sm">
            <TemplatePicker />
          </div>
        </div>
      )}
    </section>
  )
}

export default CanvasArea
