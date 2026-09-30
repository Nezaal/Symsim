import { useCallback } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useArchitectureStore } from '../store/architectureStore.js'

// maxZoom 1: a small template shouldn't be blown up to giant nodes.
const FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: 1 }

/**
 * Loads a template and frames it in the viewport.
 * React Flow queues fitView until the new nodes have been measured, so it can
 * be called right after the store update.
 * @returns {(templateId: string) => void}
 */
export function useLoadTemplate() {
  const loadTemplate = useArchitectureStore((s) => s.loadTemplate)
  const { fitView } = useReactFlow()

  return useCallback(
    (templateId) => {
      loadTemplate(templateId)
      fitView(FIT_VIEW_OPTIONS)
    },
    [loadTemplate, fitView],
  )
}
