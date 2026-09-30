import { useAuthStore } from '../store/authStore.js'
import { useProjectStore } from '../store/projectStore.js'

/** Opens the save dialog, or sign-in for guests. Shared by the Save button and Ctrl+S. */
export function requestSave() {
  const { status, openSignIn } = useAuthStore.getState()
  if (status === 'signedIn') useProjectStore.getState().openSaveDialog()
  else if (status === 'signedOut') openSignIn()
}
