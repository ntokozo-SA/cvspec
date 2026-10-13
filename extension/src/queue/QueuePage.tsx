import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type { QueueItem, QueueStatus } from '../background/queue'
import { WEB_URL } from '../shared/config'
import { sendMessage } from '../shared/messages'
import { siteAccess } from '../shared/siteAccess'
import { SITES, siteForUrl, type SiteId } from '../shared/sites'

const POLL_MS = 2000

const STATUS_LABELS: Record<QueueItem['status'], string> = {
  pending: 'Waiting',
  current: 'Open now',
  submitted: 'Submitted',
  skipped: 'Skipped',
}

function jobLabel(item: QueueItem): string {
  return [item.title ?? 'Untitled role', item.company].filter(Boolean).join(' at ')
}

function isRunning(status: QueueStatus | null): boolean {
  return status?.phase === 'ready' || status?.phase === 'active' || status?.phase === 'submitted'
}

/** Optional sites the queued jobs open on that CVSpec has no access to yet. */
function missingSites(items: QueueItem[], access: Record<SiteId, boolean> | null): SiteId[] {
  if (!access) return []
  const ids = items
    .map((item) => siteForUrl(item.url))
    .filter((id): id is SiteId => id !== null && !access[id])
  return [...new Set(ids)]
}

export function QueuePage(): ReactElement {
  const [status, setStatus] = useState<QueueStatus | null>(null)
  const [preview, setPreview] = useState<QueueItem[] | null>(null)
  const [access, setAccess] = useState<Record<SiteId, boolean> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const next = await sendMessage({ type: 'QUEUE_STATUS' })
    setStatus(next)
    return next
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const [next, granted] = await Promise.all([refresh(), siteAccess()])
        setAccess(granted)
        if (!isRunning(next)) setPreview(await sendMessage({ type: 'QUEUE_PREVIEW' }))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load your apply queue')
      }
    })()
  }, [refresh])

  const running = isRunning(status)
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => void refresh().catch(() => undefined), POLL_MS)
    return () => clearInterval(timer)
  }, [running, refresh])

  const missing = missingSites(preview ?? [], access)

  const start = () => {
    setBusy(true)
    setError(null)
    // The permission prompt must open straight from the click, before any other await.
    const origins = missing.flatMap((id) => [...SITES[id].patterns])
    const granted = origins.length > 0 ? chrome.permissions.request({ origins }) : null
    void (async () => {
      try {
        if (granted) {
          await granted.catch(() => false)
          setAccess(await siteAccess())
        }
        setStatus(await sendMessage({ type: 'QUEUE_START' }))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start the queue')
      } finally {
        setBusy(false)
      }
    })()
  }

  const act = async (type: 'QUEUE_NEXT' | 'QUEUE_SKIP' | 'QUEUE_STOP' | 'QUEUE_RESUME') => {
    setBusy(true)
    setError(null)
    try {
      const next = await sendMessage({ type })
      setStatus(next)
      if (type === 'QUEUE_STOP') setPreview(await sendMessage({ type: 'QUEUE_PREVIEW' }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const items = running ? (status?.items ?? []) : (preview ?? [])
  const finished = status?.phase === 'done'

  return (
    <main className="queue">
      <header className="queue__head">
        <span className="brand-mark" aria-hidden>
          CV
        </span>
        <div>
          <h1>Apply queue</h1>
          <p className="muted">
            CVSpec opens your queued jobs one at a time and fills each form with your tailored
            resume, cover letter and answers. You review and submit every application yourself; the
            queue only moves on after you submit or skip a job.
          </p>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      {running && status?.current && (
        <section className="card queue__now">
          <p className="queue__step">
            Job {status.position} of {status.total}
          </p>
          <strong>{jobLabel(status.current)}</strong>
          {status.phase === 'submitted' ? (
            <p className="muted">Submitted. Open the next job when you are ready.</p>
          ) : status.phase === 'ready' ? (
            <p className="muted">The job&apos;s tab was closed. Open it again to carry on.</p>
          ) : (
            <p className="muted">
              Open in another tab. Click Apply on the job page if the form isn&apos;t open yet, then
              review the filled form and submit it yourself.
            </p>
          )}
          <div className="queue__actions">
            {status.phase === 'submitted' && (
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => void act('QUEUE_NEXT')}
              >
                Next job
              </button>
            )}
            {status.phase === 'ready' && (
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => void act('QUEUE_RESUME')}
              >
                Open job again
              </button>
            )}
            {status.phase !== 'submitted' && (
              <button
                type="button"
                className="btn btn--secondary"
                disabled={busy}
                onClick={() => void act('QUEUE_SKIP')}
              >
                Skip this job
              </button>
            )}
            <button
              type="button"
              className="btn btn--secondary"
              disabled={busy}
              onClick={() => void act('QUEUE_STOP')}
            >
              Stop queue
            </button>
          </div>
        </section>
      )}

      {finished && (
        <section className="card">
          <strong>Queue finished</strong>
          <p className="muted">
            Every job was submitted or skipped. Track them under Applications in CVSpec.
          </p>
        </section>
      )}

      <section className="card">
        <h2>{running ? 'Jobs in this run' : 'Queued jobs'}</h2>
        {items.length === 0 ? (
          <p className="muted">
            {preview === null && !running
              ? 'Loading...'
              : 'No jobs queued. Choose saved jobs under Applications in CVSpec and add them to the apply queue.'}
          </p>
        ) : (
          <ol className="queue__list">
            {items.map((item) => (
              <li key={item.applicationId} className={`queue__item is-${item.status}`}>
                <div>
                  <strong>{jobLabel(item)}</strong>
                  <span className="muted">
                    {item.isForm ? 'Opens the application form' : 'Opens the job post'}
                    {item.note ? ` · ${item.note}` : ''}
                  </span>
                </div>
                {running && <span className="queue__badge">{STATUS_LABELS[item.status]}</span>}
              </li>
            ))}
          </ol>
        )}

        {!running && items.length > 0 && (
          <>
            {missing.length > 0 && (
              <p className="muted">
                Starting asks Chrome for access to{' '}
                {missing.map((id) => SITES[id].label).join(', ')} so CVSpec can fill those forms. If
                you decline, use Fill this application in the extension menu on those pages.
              </p>
            )}
            <div className="queue__actions">
              <button type="button" className="btn btn--primary" disabled={busy} onClick={start}>
                {busy ? 'Starting...' : 'Start queue'}
              </button>
              <a
                className="btn btn--secondary"
                href={`${WEB_URL}/app/queue`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Edit queue in CVSpec
              </a>
            </div>
          </>
        )}
      </section>

      <p className="muted">
        CVSpec never submits an application, never signs in for you and never stores passwords.
        Jobs that use a job board&apos;s own form (LinkedIn Easy Apply, Indeed Apply) are skipped:
        apply to those on the board yourself.
      </p>
    </main>
  )
}
