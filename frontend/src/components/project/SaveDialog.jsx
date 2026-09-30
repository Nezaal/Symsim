import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useProjectStore } from '../../store/projectStore.js'
import { inputClass } from '../fields/fieldStyles.js'

/**
 * "Save version" dialog. The first save also names the project. Each save is
 * an immutable, numbered version, like a commit, with an optional message.
 */
function SaveDialog() {
  const ref = useRef(null)
  const { open, close, project, busy, error, saveVersion } = useProjectStore(
    useShallow((s) => ({
      open: s.saveDialogOpen,
      close: s.closeSaveDialog,
      project: s.project,
      busy: s.busy,
      error: s.error,
      saveVersion: s.saveVersion,
    })),
  )

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={close}
      aria-labelledby="save-title"
      className="m-auto w-full max-w-sm rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/60"
    >
      {open && <SaveForm project={project} busy={busy} error={error} onCancel={close} onSave={saveVersion} />}
    </dialog>
  )
}

/** Mounted only while open, so fields start empty each time. */
function SaveForm({ project, busy, error, onCancel, onSave }) {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')

  return (
    <form
      className="space-y-4 p-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (!busy) onSave({ name, message })
      }}
    >
      <h2 id="save-title" className="text-base font-semibold">
        {project ? `Save a new version of "${project.name}"` : 'Save your design'}
      </h2>

      {!project && (
        <label className="block space-y-1">
          <span className="text-xs text-ink-muted">Project name</span>
          <input
            autoFocus
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Untitled design"
            className={inputClass}
          />
        </label>
      )}

      <label className="block space-y-1">
        <span className="text-xs text-ink-muted">What changed? (optional)</span>
        <input
          autoFocus={Boolean(project)}
          maxLength={500}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="e.g. added a cache in front of the DB"
          className={inputClass}
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm text-ink-muted hover:bg-surface-2">
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save version'}
        </button>
      </div>
    </form>
  )
}

export default SaveDialog
