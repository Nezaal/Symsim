import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ChevronDown, FilePlus, FolderOpen, Save, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useAuthStore } from '../../store/authStore.js'
import { useHasUnsavedChanges, useProjectStore } from '../../store/projectStore.js'
import { ghostButton } from '../../lib/buttonStyles.js'
import { requestSave } from '../../lib/requestSave.js'
import ShareButton from './ShareButton.jsx'

const DISCARD_WARNING = 'You have unsaved changes. Discard them?'

/** Project name, unsaved indicator, Save, and (signed in) the projects menu. */
function ProjectBar() {
  const authStatus = useAuthStore((s) => s.status)
  const { project, version, error, clearError } = useProjectStore(
    useShallow((s) => ({ project: s.project, version: s.version, error: s.error, clearError: s.clearError })),
  )
  const unsaved = useHasUnsavedChanges()

  if (authStatus === 'unavailable') return null

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="max-w-48 truncate text-sm text-ink" title={project?.name}>
        {project?.name ?? 'Untitled design'}
      </span>
      {version && <span className="text-xs text-ink-muted">v{version.number}</span>}
      {unsaved && (
        <span className="text-xs text-ink-muted" title={authStatus === 'signedIn' ? 'Save to keep a version' : 'Autosaved in this browser only'}>
          • {authStatus === 'signedIn' ? 'Unsaved' : 'Not saved to an account'}
        </span>
      )}
      <button type="button" onClick={requestSave} className={`${ghostButton} flex items-center gap-1.5`} title="Save version (Ctrl+S)">
        <Save size={14} aria-hidden="true" /> Save
      </button>
      {authStatus === 'signedIn' && <ShareButton />}
      {authStatus === 'signedIn' && <ProjectsMenu />}
      {error && (
        <span role="alert" className="flex items-center gap-1 text-xs text-red-400">
          {error}
          <button type="button" onClick={clearError} aria-label="Dismiss" className="rounded p-0.5 hover:bg-surface-2">
            <X size={12} aria-hidden="true" />
          </button>
        </span>
      )}
    </div>
  )
}

function ProjectsMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.user?.id)
  const unsaved = useHasUnsavedChanges()
  const { projects, projectsStatus, currentId, loadMyProjects, newDesign } = useProjectStore(
    useShallow((s) => ({
      projects: s.projects,
      projectsStatus: s.projectsStatus,
      currentId: s.project?.id,
      loadMyProjects: s.loadMyProjects,
      newDesign: s.newDesign,
    })),
  )

  useEffect(() => {
    if (!open) return undefined
    if (userId) loadMyProjects(userId)
    const onPointerDown = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKeyDown = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, userId, loadMyProjects])

  const leaveCurrent = () => !unsaved || window.confirm(DISCARD_WARNING)

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`${ghostButton} flex items-center gap-1`}>
        <FolderOpen size={14} aria-hidden="true" /> Projects <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-lg border border-line bg-surface p-1 shadow-lg">
          <button
            type="button"
            onClick={() => {
              if (!leaveCurrent()) return
              setOpen(false)
              newDesign()
              navigate('/app')
            }}
            className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-ink hover:bg-surface-2"
          >
            <FilePlus size={14} aria-hidden="true" /> New design
          </button>
          <div className="my-1 border-t border-line" />
          {projectsStatus === 'loading' && <p className="px-3 py-2 text-xs text-ink-muted">Loading…</p>}
          {projectsStatus === 'ready' && projects.length === 0 && (
            <p className="px-3 py-2 text-xs text-ink-muted">No saved projects yet.</p>
          )}
          <ul className="max-h-72 overflow-y-auto">
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={p.id === currentId}
                  onClick={() => {
                    if (!leaveCurrent()) return
                    setOpen(false)
                    navigate(`/app/p/${p.id}`)
                  }}
                  className="w-full rounded px-3 py-2 text-left hover:bg-surface-2 disabled:cursor-default disabled:bg-surface-2"
                >
                  <span className="block truncate text-sm text-ink">{p.name}</span>
                  <span className="block text-xs text-ink-muted">
                    Updated {new Date(p.updated_at).toLocaleString()}
                    {p.id === currentId && ' · open'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default ProjectBar
