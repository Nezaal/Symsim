import { create } from 'zustand'
import { fetchAuthProviders, supabase } from '../lib/supabase.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PROVIDER_NAMES = { github: 'GitHub', google: 'Google' }

/** Where OAuth / magic links send the user back to: the page they're on. */
const returnUrl = () =>
  globalThis.location ? `${globalThis.location.origin}${globalThis.location.pathname}` : undefined

/**
 * Sign-in state. Supabase Auth owns the session (persisted and refreshed by
 * supabase-js); this store mirrors it for the UI and loads the public profile.
 *
 * status: loading | signedOut | signedIn | unavailable (no Supabase configured)
 *
 * @param {import('@supabase/supabase-js').SupabaseClient | null} client injectable for tests
 * @param {() => Promise<{ github: boolean, google: boolean, email: boolean }>} loadProviders
 */
export function createAuthStore(client = supabase, loadProviders = fetchAuthProviders) {
  let initPromise = null

  return create((set, get) => {
    const applySession = async (session) => {
      if (!session?.user) {
        set({ status: 'signedOut', user: null, profile: null })
        return
      }
      set({ status: 'signedIn', user: session.user })
      const { data, error } = await client
        .from('profiles')
        .select('username, display_name, avatar_url')
        .eq('id', session.user.id)
        .maybeSingle()
      if (error) console.warn('Could not load profile', error)
      // Ignore a late profile response if the user signed out meanwhile.
      if (get().user?.id === session.user.id) set({ profile: data ?? null })
    }

    return {
      status: 'loading',
      user: null,
      profile: null,
      providers: { github: false, google: false, email: false },
      dialogOpen: false,
      magicLinkSentTo: null,
      error: null,

      /** Idempotent: safe to call from every page. */
      init: () => {
        if (initPromise) return initPromise
        initPromise = (async () => {
          if (!client) {
            set({ status: 'unavailable' })
            return
          }
          client.auth.onAuthStateChange((_event, session) => {
            // Don't await inside the callback: supabase-js holds a lock while it runs.
            setTimeout(() => applySession(session), 0)
          })
          try {
            const [{ data }, providers] = await Promise.all([client.auth.getSession(), loadProviders()])
            set({ providers })
            await applySession(data.session)
          } catch (error) {
            // Backend unreachable: carry on as a guest rather than spinning forever.
            console.error('Could not restore the session', error)
            set({ status: 'signedOut', user: null, profile: null })
          }
        })()
        return initPromise
      },

      openSignIn: () => set({ dialogOpen: true, error: null, magicLinkSentTo: null }),
      closeSignIn: () => set({ dialogOpen: false, error: null }),

      signInWith: async (provider) => {
        set({ error: null })
        const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo: returnUrl() } })
        if (error) {
          console.warn('OAuth sign-in failed', error)
          set({ error: `Couldn't start ${PROVIDER_NAMES[provider] ?? provider} sign-in. Please try again.` })
        }
      },

      sendMagicLink: async (rawEmail) => {
        const email = String(rawEmail ?? '').trim()
        if (!EMAIL_PATTERN.test(email)) {
          set({ error: 'Enter a valid email address.' })
          return
        }
        set({ error: null })
        const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: returnUrl() } })
        if (error) {
          console.warn('Magic link failed', error)
          set({ error: "Couldn't send the sign-in link. Please try again." })
          return
        }
        set({ magicLinkSentTo: email })
      },

      signOut: async () => {
        const { error } = await client.auth.signOut()
        if (error) console.warn('Sign-out failed', error)
        set({ status: 'signedOut', user: null, profile: null })
      },
    }
  })
}

export const useAuthStore = createAuthStore()
