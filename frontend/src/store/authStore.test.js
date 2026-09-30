import { describe, expect, it, vi } from 'vitest'
import { createAuthStore } from './authStore.js'

const user = { id: 'u1', email: 'ada@example.com' }

/** Fake supabase client covering the auth calls the store uses. */
function fakeClient({ session = null } = {}) {
  let listener = null
  const profileRow = { username: 'ada', display_name: 'Ada L', avatar_url: null }
  return {
    emit: (event, nextSession) => listener?.(event, nextSession),
    auth: {
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
      onAuthStateChange: vi.fn((cb) => {
        listener = cb
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
      signInWithOAuth: vi.fn(async () => ({ error: null })),
      signInWithOtp: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profileRow, error: null }) }) }),
    })),
  }
}

const providers = async () => ({ github: true, google: false, email: true })

describe('auth store', () => {
  it('is unavailable when Supabase is not configured', async () => {
    const store = createAuthStore(null, providers)
    await store.getState().init()
    expect(store.getState().status).toBe('unavailable')
  })

  it('starts signed out without a session and loads providers', async () => {
    const store = createAuthStore(fakeClient(), providers)
    await store.getState().init()
    expect(store.getState()).toMatchObject({ status: 'signedOut', user: null, providers: { github: true } })
  })

  it('restores an existing session with the profile', async () => {
    const store = createAuthStore(fakeClient({ session: { user } }), providers)
    await store.getState().init()
    expect(store.getState()).toMatchObject({ status: 'signedIn', user, profile: { username: 'ada' } })
  })

  it('follows sign-in and sign-out events', async () => {
    const client = fakeClient()
    const store = createAuthStore(client, providers)
    await store.getState().init()
    client.emit('SIGNED_IN', { user })
    await vi.waitFor(() => expect(store.getState().status).toBe('signedIn'))
    client.emit('SIGNED_OUT', null)
    await vi.waitFor(() => expect(store.getState()).toMatchObject({ status: 'signedOut', user: null, profile: null }))
  })

  it('falls back to signed out when the session cannot be restored', async () => {
    const client = fakeClient()
    client.auth.getSession.mockRejectedValueOnce(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = createAuthStore(client, providers)
    await store.getState().init()
    expect(store.getState().status).toBe('signedOut')
  })

  it('initializes only once', async () => {
    const client = fakeClient()
    const store = createAuthStore(client, providers)
    await Promise.all([store.getState().init(), store.getState().init()])
    expect(client.auth.onAuthStateChange).toHaveBeenCalledTimes(1)
  })

  it('rejects an invalid email before calling Supabase', async () => {
    const client = fakeClient()
    const store = createAuthStore(client, providers)
    await store.getState().sendMagicLink('not-an-email')
    expect(client.auth.signInWithOtp).not.toHaveBeenCalled()
    expect(store.getState().error).toMatch(/email/i)
  })

  it('sends a magic link and remembers where it went', async () => {
    const client = fakeClient()
    const store = createAuthStore(client, providers)
    await store.getState().sendMagicLink('  ada@example.com ')
    expect(client.auth.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ada@example.com' }),
    )
    expect(store.getState().magicLinkSentTo).toBe('ada@example.com')
  })

  it('shows a friendly error when a provider sign-in fails', async () => {
    const client = fakeClient()
    client.auth.signInWithOAuth.mockResolvedValueOnce({ error: { message: 'provider is not enabled' } })
    const store = createAuthStore(client, providers)
    await store.getState().signInWith('github')
    expect(store.getState().error).toMatch(/GitHub/)
  })
})
