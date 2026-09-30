import { Navigate, Route, Routes } from 'react-router'
import LandingPage from './pages/LandingPage.jsx'
import EditorPage from './pages/EditorPage.jsx'

/**
 * Routes:
 *   /                 landing page
 *   /app              editor (guest or signed in)
 *   /app/p/:projectId editor with a saved project open
 *   /s/:token         read-only shared design (added with share links)
 */
function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/app" element={<EditorPage />} />
      <Route path="/app/p/:projectId" element={<EditorPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
