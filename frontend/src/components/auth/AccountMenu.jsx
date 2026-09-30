import { useEffect, useRef, useState } from 'react'
import { LogOut } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useAuthStore } from '../../store/authStore.js'

/** "Sign in" for guests; an avatar menu with sign-out once signed in. */
function AccountMenu() {
  const { status, user, profile, openSignIn, signOut } = useAuthStore(
    useShallow((s) => ({ status: s.status, user: s.user, profile: s.profile, openSignIn: s.openSignIn, signOut: s.signOut })),
  )
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

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

  if (status === 'unavailable' || status === 'loading') return null

  if (status !== 'signedIn') {
    return (
      <button type="button" onClick={openSignIn} className="rounded-md px-2.5 py-1.5 text-sm text-ink hover:bg-surface-2">
        Sign in
      </button>
    )
  }

  const name = profile?.display_name || profile?.username || user.email
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Account: ${name}`}
        aria-expanded={open}
        className="flex size-8 items-center justify-center overflow-hidden rounded-full border border-line bg-surface-2 text-xs font-semibold text-ink"
      >
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          (name?.[0] ?? '?').toUpperCase()
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-lg border border-line bg-surface p-1 shadow-lg">
          <p className="truncate px-3 py-2 text-sm text-ink">{name}</p>
          {profile?.username && <p className="truncate px-3 pb-2 text-xs text-ink-muted">@{profile.username}</p>}
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              signOut()
            }}
            className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-ink hover:bg-surface-2"
          >
            <LogOut size={14} aria-hidden="true" /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export default AccountMenu
