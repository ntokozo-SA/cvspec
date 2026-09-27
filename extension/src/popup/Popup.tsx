import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { scanJsonLdJobPosting } from '../content/adapters/jsonLd'
import { WEB_URL } from '../shared/config'
import { sendMessage } from '../shared/messages'
import type { Application, AuthState, Board, ScrapedJob } from '../shared/types'

const STATUS_LABELS: Record<Application['status'], string> = {
  saved: 'Saved',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
}

function boardFor(url: string): Board {
  const host = new URL(url).hostname
  if (host.endsWith('linkedin.com')) return 'linkedin'
  if (host.endsWith('indeed.com')) return 'indeed'
  if (host.includes('glassdoor.')) return 'glassdoor'
  return 'other'
}

function openTab(url: string): void {
  void chrome.tabs.create({ url })
  window.close()
}

type ScanState =
  | { kind: 'idle' }
  | { kind: 'scanning' }
  | { kind: 'found'; job: ScrapedJob }
  | { kind: 'saving'; job: ScrapedJob }
  | { kind: 'saved'; job: ScrapedJob }
  | { kind: 'error'; message: string }

export function Popup(): ReactElement {
  const [auth, setAuth] = useState<AuthState | null>(null)
  const [recent, setRecent] = useState<Application[] | null>(null)
  const [scan, setScan] = useState<ScanState>({ kind: 'idle' })
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const next = await sendMessage({ type: 'GET_AUTH' }).catch(() => ({ connected: false }))
    setAuth(next)
    if (!next.connected) return
    try {
      const apps = await sendMessage({ type: 'LIST_APPLICATIONS' })
      setRecent(apps.slice(0, 5))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load saved jobs')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const scanPage = async () => {
    setScan({ kind: 'scanning' })
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id || !tab.url?.startsWith('http')) throw new Error('This page cannot be scanned.')
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scanJsonLdJobPosting,
      })
      const job = result?.result as ScrapedJob | null | undefined
      if (!job) {
        setScan({ kind: 'error', message: 'No job posting data found on this page.' })
        return
      }
      setScan({ kind: 'found', job: { ...job, board: boardFor(job.url) } })
    } catch (err) {
      setScan({
        kind: 'error',
        message: err instanceof Error ? err.message : 'This page cannot be scanned.',
      })
    }
  }

  const saveScanned = async (job: ScrapedJob) => {
    setScan({ kind: 'saving', job })
    try {
      const saved = await sendMessage({ type: 'SAVE_JOB', job })
      setScan({ kind: 'saved', job })
      setRecent((prev) => [saved, ...(prev ?? []).filter((a) => a.id !== saved.id)].slice(0, 5))
    } catch (err) {
      setScan({ kind: 'error', message: err instanceof Error ? err.message : 'Could not save job' })
    }
  }

  const disconnect = async () => {
    await sendMessage({ type: 'SIGNOUT' }).catch(() => undefined)
    setAuth({ connected: false })
    setRecent(null)
  }

  return (
    <div className="popup">
      <header className="popup__head">
        <span className="brand-mark" aria-hidden>
          CV
        </span>
        <span className="brand-text">CVSpec</span>
      </header>

      {auth === null ? (
        <p className="muted">Checking connection...</p>
      ) : !auth.connected ? (
        <section className="card">
          <h2>Connect your account</h2>
          <p className="muted">
            Log in to CVSpec and the extension connects automatically. No separate extension login.
          </p>
          <button type="button" className="btn btn--primary" onClick={() => openTab(`${WEB_URL}/app`)}>
            Connect to CVSpec
          </button>
        </section>
      ) : (
        <>
          <section className="account">
            <div>
              <div className="eyebrow">Connected</div>
              <div className="account__email" title={auth.email}>
                {auth.email}
              </div>
            </div>
            <button type="button" className="link" onClick={() => void disconnect()}>
              Disconnect
            </button>
          </section>

          <section className="card">
            <h2>This page</h2>
            {scan.kind === 'idle' && (
              <>
                <p className="muted">
                  On LinkedIn, Indeed and Glassdoor the Save and Tailor buttons appear next to Apply.
                  On other job sites, scan the page for a posting.
                </p>
                <button type="button" className="btn btn--secondary" onClick={() => void scanPage()}>
                  Scan this page
                </button>
              </>
            )}
            {scan.kind === 'scanning' && <p className="muted">Scanning...</p>}
            {(scan.kind === 'found' || scan.kind === 'saving' || scan.kind === 'saved') && (
              <>
                <div className="job">
                  <strong>{scan.job.title}</strong>
                  <span className="muted">
                    {[scan.job.company, scan.job.location].filter(Boolean).join(' | ')}
                  </span>
                </div>
                {scan.kind === 'saved' ? (
                  <p className="ok">Saved to CVSpec</p>
                ) : (
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={scan.kind === 'saving'}
                    onClick={() => void saveScanned(scan.job)}
                  >
                    {scan.kind === 'saving' ? 'Syncing...' : 'Save to CVSpec'}
                  </button>
                )}
              </>
            )}
            {scan.kind === 'error' && (
              <>
                <p className="error">{scan.message}</p>
                <button type="button" className="btn btn--secondary" onClick={() => void scanPage()}>
                  Try again
                </button>
              </>
            )}
          </section>

          <section className="card">
            <div className="card__head">
              <h2>Recently saved</h2>
              <button
                type="button"
                className="link"
                onClick={() => openTab(`${WEB_URL}/app/applications`)}
              >
                Open dashboard
              </button>
            </div>
            {error && <p className="error">{error}</p>}
            {recent === null ? (
              !error && <p className="muted">Loading...</p>
            ) : recent.length === 0 ? (
              <p className="muted">No saved jobs yet.</p>
            ) : (
              <ul className="recent">
                {recent.map((app) => (
                  <li key={app.id}>
                    <button type="button" onClick={() => openTab(app.source_url)}>
                      <span className="recent__meta">
                        <strong>{app.title ?? 'Untitled role'}</strong>
                        <span className="muted">
                          {app.company ?? 'Unknown company'} | {STATUS_LABELS[app.status]}
                        </span>
                      </span>
                      <span className="recent__score">
                        {app.comparison ? `${Math.round(Number(app.comparison.match_score))}%` : '--'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
