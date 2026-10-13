import { SESSION_STORAGE_KEY } from '../shared/config'
import { sendMessage } from '../shared/messages'

type WebMessage =
  | { source: 'cvspec-web'; type: 'ping' }
  | { source: 'cvspec-web'; type: 'handoff'; tokenHash: string }
  | { source: 'cvspec-web'; type: 'signout' }
  | { source: 'cvspec-web'; type: 'start-queue' }

function postToPage(message: Record<string, unknown>): void {
  window.postMessage({ source: 'cvspec-ext', ...message }, window.location.origin)
}

async function announce(): Promise<void> {
  try {
    const auth = await sendMessage({ type: 'GET_AUTH' })
    postToPage({ type: 'ready', connected: auth.connected, email: auth.email })
  } catch {
    postToPage({ type: 'ready', connected: false })
  }
}

function isWebMessage(data: unknown): data is WebMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { source?: unknown }).source === 'cvspec-web'
  )
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || event.origin !== window.location.origin) return
  const data: unknown = event.data
  if (!isWebMessage(data)) return

  if (data.type === 'ping') {
    void announce()
  } else if (data.type === 'handoff' && typeof data.tokenHash === 'string') {
    sendMessage({ type: 'HANDOFF', tokenHash: data.tokenHash }).then(
      (auth) => postToPage({ type: 'handoff-result', ok: true, email: auth.email }),
      (err: unknown) =>
        postToPage({
          type: 'handoff-result',
          ok: false,
          error: err instanceof Error ? err.message : 'Handoff failed',
        }),
    )
  } else if (data.type === 'signout') {
    void sendMessage({ type: 'SIGNOUT' }).catch(() => undefined)
  } else if (data.type === 'start-queue') {
    sendMessage({ type: 'QUEUE_OPEN' }).then(
      () => postToPage({ type: 'queue-opened', ok: true }),
      (err: unknown) =>
        postToPage({
          type: 'queue-opened',
          ok: false,
          error: err instanceof Error ? err.message : 'Could not open the queue',
        }),
    )
  }
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && SESSION_STORAGE_KEY in changes) void announce()
})

void announce()
