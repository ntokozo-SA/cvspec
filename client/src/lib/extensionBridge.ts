import type { Session } from '@supabase/supabase-js'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'
const HANDOFF_TIMEOUT_MS = 15000

export interface ExtensionStatus {
  installed: boolean
  connected: boolean
  email?: string
}

type ExtensionMessage =
  | { source: 'cvspec-ext'; type: 'ready'; connected: boolean; email?: string }
  | { source: 'cvspec-ext'; type: 'handoff-result'; ok: boolean; email?: string; error?: string }

let status: ExtensionStatus = { installed: false, connected: false }
let currentSession: Session | null = null
let handoffTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<(next: ExtensionStatus) => void>()

function setStatus(next: ExtensionStatus): void {
  status = next
  listeners.forEach((listener) => listener(status))
}

function post(message: Record<string, unknown>): void {
  window.postMessage({ source: 'cvspec-web', ...message }, window.location.origin)
}

function isExtensionMessage(data: unknown): data is ExtensionMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { source?: unknown }).source === 'cvspec-ext'
  )
}

function clearHandoffTimer(): void {
  if (handoffTimer) clearTimeout(handoffTimer)
  handoffTimer = null
}

async function maybeHandoff(): Promise<void> {
  const email = currentSession?.user.email
  const token = currentSession?.access_token
  if (!status.installed || handoffTimer || !email || !token) return
  if (status.connected && status.email?.toLowerCase() === email.toLowerCase()) return

  handoffTimer = setTimeout(clearHandoffTimer, HANDOFF_TIMEOUT_MS)
  try {
    const response = await fetch(`${API_BASE}/extension/handoff`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) throw new Error(`Handoff failed (${response.status})`)
    const { tokenHash } = (await response.json()) as { tokenHash: string }
    post({ type: 'handoff', tokenHash })
  } catch (err) {
    clearHandoffTimer()
    console.warn('[cvspec] extension handoff failed', err)
  }
}

function onMessage(event: MessageEvent): void {
  if (event.source !== window || event.origin !== window.location.origin) return
  const data: unknown = event.data
  if (!isExtensionMessage(data)) return

  if (data.type === 'ready') {
    setStatus({ installed: true, connected: data.connected, email: data.email })
    void maybeHandoff()
    return
  }

  clearHandoffTimer()
  if (data.ok) {
    setStatus({ installed: true, connected: true, email: data.email })
  } else {
    console.warn('[cvspec] extension rejected handoff', data.error)
  }
}

export function initExtensionBridge(): () => void {
  window.addEventListener('message', onMessage)
  post({ type: 'ping' })
  return () => window.removeEventListener('message', onMessage)
}

export function syncExtensionSession(session: Session | null): void {
  currentSession = session
  void maybeHandoff()
}

export function signOutExtension(): void {
  currentSession = null
  clearHandoffTimer()
  post({ type: 'signout' })
  if (status.installed) setStatus({ installed: true, connected: false })
}

export function getExtensionStatus(): ExtensionStatus {
  return status
}

export function subscribeExtensionStatus(listener: (next: ExtensionStatus) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
