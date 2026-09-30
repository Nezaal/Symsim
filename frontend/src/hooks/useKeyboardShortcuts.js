import { useEffect } from 'react'
import { useArchitectureStore } from '../store/architectureStore.js'
import { useSimulationStore } from '../store/simulationStore.js'
import { shortcutFor } from './shortcuts.js'
import { requestSave } from '../lib/requestSave.js'

/** Global editor shortcuts: undo, redo, duplicate, save. Delete is handled by React Flow. */
export function useKeyboardShortcuts() {
  useEffect(() => {
    function onKeyDown(event) {
      // No editing the canvas while the full-page results cover it.
      const command = shortcutFor(event, { enabled: !useSimulationStore.getState().drawerOpen })
      if (!command) return
      event.preventDefault() // e.g. stop Ctrl+D (bookmark) and Ctrl+S (save page) in the browser
      if (command === 'save') return requestSave()

      // getState() instead of a hook subscription: this listener is created once
      // and must always call the latest actions.
      const { undo, redo, duplicateSelected } = useArchitectureStore.getState()
      if (command === 'undo') undo()
      else if (command === 'redo') redo()
      else if (command === 'duplicate') duplicateSelected()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
