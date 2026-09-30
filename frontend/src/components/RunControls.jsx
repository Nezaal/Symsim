import { useEffect, useRef, useState } from 'react'
import { Pause, Play, RefreshCw, Settings2, Square } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { MAX_DURATION_SEC } from '@systemsim/engine'
import { useSimulationStore } from '../store/simulationStore.js'
import { useArchitectureStore } from '../store/architectureStore.js'
import { ghostButton } from '../lib/buttonStyles.js'
import { inputClass } from './fields/fieldStyles.js'

/** ▶ Run, or ⏸ Pause / ▶ Resume + ■ Stop while a run is active, plus run settings. */
function RunControls() {
  const { status, start, pause, resume, stop } = useSimulationStore(
    useShallow((s) => ({ status: s.status, start: s.start, pause: s.pause, resume: s.resume, stop: s.stop })),
  )
  const active = status === 'running' || status === 'paused'

  const run = () => {
    const { nodes, edges } = useArchitectureStore.getState()
    start(nodes, edges)
  }

  return (
    <div className="ml-auto flex items-center gap-1.5">
      <RunSettings disabled={active} />
      {active ? (
        <>
          <button type="button" onClick={status === 'running' ? pause : resume} className={secondaryButton}>
            {status === 'running' ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
            {status === 'running' ? 'Pause' : 'Resume'}
          </button>
          <button type="button" onClick={stop} className={secondaryButton}>
            <Square size={13} aria-hidden="true" /> Stop
          </button>
        </>
      ) : (
        <button type="button" onClick={run} className={primaryButton}>
          <Play size={14} aria-hidden="true" fill="currentColor" /> Run
        </button>
      )}
    </div>
  )
}

/** Duration and seed. Showing the seed makes any run reproducible. */
function RunSettings({ disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const { options, setOptions, newSeed } = useSimulationStore(
    useShallow((s) => ({ options: s.options, setOptions: s.setOptions, newSeed: s.newSeed })),
  )

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKeyDown = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-label="Run settings"
        aria-expanded={open}
        title="Run settings"
        className={ghostButton}
      >
        <Settings2 size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-60 space-y-3 rounded-lg border border-line bg-surface p-3 shadow-lg">
          <label className="block space-y-1">
            <span className="flex justify-between text-xs text-ink-muted">
              Duration <span>seconds (1–{MAX_DURATION_SEC})</span>
            </span>
            <input
              type="number"
              min={1}
              max={MAX_DURATION_SEC}
              value={options.durationSec}
              onChange={(e) => setOptions({ durationSec: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-ink-muted">Seed (same seed + design = same result)</span>
            <span className="flex gap-1.5">
              <input
                type="number"
                min={0}
                value={options.seed}
                onChange={(e) => setOptions({ seed: e.target.value })}
                className={inputClass}
              />
              <button type="button" onClick={newSeed} aria-label="New random seed" title="New random seed" className={ghostButton}>
                <RefreshCw size={14} aria-hidden="true" />
              </button>
            </span>
          </label>
        </div>
      )}
    </div>
  )
}

const primaryButton =
  'flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90'
const secondaryButton =
  'flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm text-ink hover:bg-surface-2'

export default RunControls
