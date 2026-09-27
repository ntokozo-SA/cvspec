import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js'
import { SESSION_STORAGE_KEY } from '../shared/config'
import type { AuthState } from '../shared/types'

const chromeStorage: SupportedStorage = {
  async getItem(key) {
    const result = await chrome.storage.local.get(key)
    const value = result[key]
    return typeof value === 'string' ? value : null
  },
  async setItem(key, value) {
    await chrome.storage.local.set({ [key]: value })
  },
  async removeItem(key) {
    await chrome.storage.local.remove(key)
  },
}

let client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set for the extension')
  }
  client = createClient(url, key, {
    auth: {
      storage: chromeStorage,
      storageKey: SESSION_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })
  return client
}

/** Returns a valid access token, refreshing the session first if it has expired. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await getClient().auth.getSession()
  return data.session?.access_token ?? null
}

export async function getAuthState(): Promise<AuthState> {
  const { data } = await getClient().auth.getSession()
  if (!data.session) return { connected: false }
  return { connected: true, email: data.session.user.email }
}

export async function completeHandoff(tokenHash: string): Promise<AuthState> {
  const { data, error } = await getClient().auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  })
  if (error) throw error
  if (!data.session) throw new Error('Handoff did not produce a session')
  return { connected: true, email: data.session.user.email }
}

export async function signOut(): Promise<AuthState> {
  await getClient().auth.signOut({ scope: 'local' })
  await chrome.storage.local.remove(SESSION_STORAGE_KEY)
  return { connected: false }
}
