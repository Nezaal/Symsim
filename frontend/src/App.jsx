import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { useAuthStore } from './store/authStore.js'
import SignInDialog from './components/auth/SignInDialog.jsx'
import LandingPage from './pages/LandingPage.jsx'
import EditorPage from './pages/EditorPage.jsx'
import SharedPage from './pages/SharedPage.jsx'

/**
 * Routes:
 *   /                 landing page
 *   /app              editor (guest or signed in)
 *   /app/p/:projectId editor with a saved project open
 *   /s/:token         read-only shared design (works signed out)
 */
function App() {
  const initAuth = useAuthStore((s) => s.init)
  useEffect(() => {
    initAuth()
  }, [initAuth])

  return (
    <>
      <AppRoutes />
      <SignInDialog />
    </>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      {/* One route for /app and /app/p/:projectId, so saving (which changes the
          URL) never remounts the editor and resets the canvas view. */}
      <Route path="/app/*" element={<EditorPage />} />
      <Route path="/s/:token" element={<SharedPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
