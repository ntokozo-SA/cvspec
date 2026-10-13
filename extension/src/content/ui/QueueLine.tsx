import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import type { QueueStatus } from '../../background/queue'
import { sendMessage } from '../../shared/messages'

const POLL_MS = 2000

/** The apply-queue status for this tab, refreshed while the queue runs. */
export function useQueueStatus(): [QueueStatus | null, (next: QueueStatus) => void] {
  const [status, setStatus] = useState<QueueStatus | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const next = await sendMessage({ type: 'QUEUE_STATUS' })
        if (alive) setStatus(next)
      } catch {
        // the queue line is optional
      }
    }
    void load()
    const timer = setInterval(() => void load(), POLL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  return [status, setStatus]
}

export function isQueueTab(status: QueueStatus | null): boolean {
  return (
    status !== null &&
    status.thisTab &&
    (status.phase === 'active' || status.phase === 'ready' || status.phase === 'submitted')
  )
}

/**
 * "Job 2 of 5 · Skip · Stop" on a tab the apply queue opened. With `builtInApply`, a job board
 * page whose Apply opens the board's own form is skipped (CVSpec never fills those).
 */
export function QueueLine({
  queue: [status, setStatus],
  builtInApply,
}: {
  queue: ReturnType<typeof useQueueStatus>
  builtInApply?: () => boolean
}): ReactElement | null {
  const [busy, setBusy] = useState(false)
  const reported = useRef<string | null>(null)

  const act = useCallback(
    async (type: 'QUEUE_NEXT' | 'QUEUE_SKIP' | 'QUEUE_STOP') => {
      setBusy(true)
      try {
        setStatus(await sendMessage({ type }))
      } catch {
        // the queue page shows errors
      } finally {
        setBusy(false)
      }
    },
    [setStatus],
  )

  const onQueue = isQueueTab(status)
  const currentId = status?.current?.applicationId ?? null
  useEffect(() => {
    if (!onQueue || !builtInApply || !currentId || status?.phase !== 'active') return
    if (reported.current === currentId || !builtInApply()) return
    reported.current = currentId
    void sendMessage({ type: 'QUEUE_BUILT_IN', applicationId: currentId })
      .then(setStatus)
      .catch(() => undefined)
  }, [onQueue, builtInApply, currentId, status, setStatus])

  if (!onQueue || !status) return null

  return (
    <div className="cvs-queue" role="status">
      <span className="cvs-queue__label">
        {status.phase === 'submitted'
          ? `Job ${status.position} of ${status.total} submitted`
          : `Apply queue: job ${status.position} of ${status.total}`}
      </span>
      {status.phase === 'submitted' ? (
        <button
          type="button"
          className="cvs-link"
          disabled={busy}
          onClick={() => void act('QUEUE_NEXT')}
        >
          {status.position < status.total ? 'Next job' : 'Finish'}
        </button>
      ) : (
        <button
          type="button"
          className="cvs-link"
          disabled={busy}
          onClick={() => void act('QUEUE_SKIP')}
        >
          Skip
        </button>
      )}
      <button
        type="button"
        className="cvs-link"
        disabled={busy}
        onClick={() => void act('QUEUE_STOP')}
      >
        Stop
      </button>
    </div>
  )
}
