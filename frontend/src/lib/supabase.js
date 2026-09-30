import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/**
 * The app works without a backend (guests can design and run). Saving and
 * sign-in need these two public values; see frontend/.env.example.
 */
export const isSupabaseConfigured = Boolean(url && publishableKey)

/**
 * Browser client. Uses the publishable key only: it's public by design, and
 * every table is protected by Row Level Security. PKCE flow: OAuth and magic
 * links return a one-time code that supabase-js exchanges on page load.
 */
export const supabase = isSupabaseConfigured
  ? createClient(url, publishableKey, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

/**
 * Which sign-in methods the Supabase project has enabled, so the UI only
 * offers working buttons. Falls back to "none" if the server can't be reached.
 * @returns {Promise<{ github: boolean, google: boolean, email: boolean }>}
 */
export async function fetchAuthProviders() {
  const none = { github: false, google: false, email: false }
  if (!isSupabaseConfigured) return none
  try {
    const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: publishableKey } })
    if (!response.ok) return none
    const { external = {} } = await response.json()
    return { github: Boolean(external.github), google: Boolean(external.google), email: Boolean(external.email) }
  } catch (error) {
    console.warn('Could not load sign-in providers', error)
    return none
  }
}
