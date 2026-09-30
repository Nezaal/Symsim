import { useEffect, useRef, useState } from 'react'
import { Mail, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useAuthStore } from '../../store/authStore.js'
import { inputClass } from '../fields/fieldStyles.js'

const PROVIDERS = [
  { id: 'github', label: 'Continue with GitHub' },
  { id: 'google', label: 'Continue with Google' },
]

/**
 * Sign-in modal. Uses the native <dialog> element: focus trapping, Escape,
 * and the backdrop come from the browser.
 *
 * Only providers enabled in Supabase are clickable. The email magic link is
 * offered in development only (local Supabase delivers it to a test inbox).
 */
function SignInDialog() {
  const ref = useRef(null)
  const { dialogOpen, closeSignIn, providers, signInWith, sendMagicLink, magicLinkSentTo, error } = useAuthStore(
    useShallow((s) => ({
      dialogOpen: s.dialogOpen,
      closeSignIn: s.closeSignIn,
      providers: s.providers,
      signInWith: s.signInWith,
      sendMagicLink: s.sendMagicLink,
      magicLinkSentTo: s.magicLinkSentTo,
      error: s.error,
    })),
  )

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (dialogOpen && !dialog.open) dialog.showModal()
    if (!dialogOpen && dialog.open) dialog.close()
  }, [dialogOpen])

  const anyProvider = providers.github || providers.google || (import.meta.env.DEV && providers.email)

  return (
    <dialog
      ref={ref}
      onClose={closeSignIn}
      aria-labelledby="sign-in-title"
      className="m-auto w-full max-w-sm rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/60"
    >
      <div className="space-y-4 p-5">
        <header className="flex items-start justify-between">
          <div>
            <h2 id="sign-in-title" className="text-base font-semibold">
              Sign in to save your work
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Save designs, keep run history and share links. You can keep running simulations without an account.
            </p>
          </div>
          <button
            type="button"
            onClick={closeSignIn}
            aria-label="Close"
            className="rounded-md p-1 text-ink-muted hover:bg-surface-2 hover:text-ink"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="space-y-2">
          {PROVIDERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              disabled={!providers[id]}
              onClick={() => signInWith(id)}
              className="w-full rounded-md border border-line px-3 py-2 text-sm font-medium hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {label}
              {!providers[id] && <span className="block text-xs font-normal text-ink-muted">Not set up yet</span>}
            </button>
          ))}
        </div>

        {import.meta.env.DEV && providers.email && (
          <MagicLinkForm onSend={sendMagicLink} sentTo={magicLinkSentTo} />
        )}

        {!anyProvider && (
          <p className="text-sm text-ink-muted">
            Sign-in isn't available right now. You can still design and run simulations.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
      </div>
    </dialog>
  )
}

/** Development only: sign in via a link delivered to local Supabase's test inbox. */
function MagicLinkForm({ onSend, sentTo }) {
  const [email, setEmail] = useState('')

  if (sentTo) {
    return (
      <p className="rounded-md border border-line bg-canvas p-3 text-sm text-ink-muted">
        Link sent to <span className="text-ink">{sentTo}</span>. Open the local test inbox at{' '}
        <a href="http://127.0.0.1:54324" target="_blank" rel="noreferrer" className="text-accent underline">
          127.0.0.1:54324
        </a>{' '}
        and click it.
      </p>
    )
  }

  return (
    <form
      className="space-y-2 border-t border-line pt-4"
      onSubmit={(event) => {
        event.preventDefault()
        onSend(email)
      }}
    >
      <label htmlFor="magic-email" className="text-xs text-ink-muted">
        Development: sign in with an email link
      </label>
      <div className="flex gap-2">
        <input
          id="magic-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={inputClass}
        />
        <button type="submit" className="flex items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-white">
          <Mail size={14} aria-hidden="true" /> Send
        </button>
      </div>
    </form>
  )
}

export default SignInDialog
