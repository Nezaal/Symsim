import { Link } from 'react-router'
import TemplatesMenu from './TemplatesMenu.jsx'
import RunControls from './RunControls.jsx'
import AccountMenu from './auth/AccountMenu.jsx'
import ProjectBar from './project/ProjectBar.jsx'

/** Slim top bar. Canvas tools (zoom, undo/redo) live on the canvas itself. */
function Toolbar() {
  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
      <h1 className="text-sm font-semibold tracking-tight">
        <Link to="/" className="hover:text-accent">
          SystemSim
        </Link>
      </h1>
      <span className="h-5 w-px bg-line" aria-hidden="true" />
      <ProjectBar />
      <TemplatesMenu />
      <RunControls />
      <AccountMenu />
    </header>
  )
}

export default Toolbar
