import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { scanJsonLdJobPosting } from '../content/adapters/jsonLd'
import applyFormScript from '../content/applyForm/index.tsx?script'
import { boardForUrl, STATIC_BOARD_IDS } from '../shared/boards'
import { WEB_URL } from '../shared/config'
import { sendMessage, type ExtractJobRequest } from '../shared/messages'
import { requestSite, siteAccess } from '../shared/siteAccess'
import { siteForUrl, SITES, type SiteId } from '../shared/sites'
import type { Application, AuthState, ScrapedJob } from '../shared/types'

const STATUS_LABELS: Record<Application['status'], string> = {
  saved: 'Saved',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
}

async function extractWithAdapter(tabId: number): Promise<ScrapedJob | null> {
  try {
    const job: unknown = await chrome.tabs.sendMessage(tabId, {
      type: 'EXTRACT_JOB',
    } satisfies ExtractJobRequest)
    return (job as ScrapedJob | null) ?? null
  } catch {
    return null
  }
}

function openTab(url: string): void {
  void chrome.tabs.create({ url })
  window.close()
}

/**
 * Runs the application form helper in the active tab. `activeTab` grants access to the page
 * because the user opened the popup, so no broad host permission is needed.
 */
async function injectFormHelper(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      ;(globalThis as Record<string, unknown>).__cvspecApplyFormInjected = true
    },
  })
  await chrome.scripting.executeScript({ target: { tabId }, files: [applyFormScript] })
}

type ScanState =
  | { kind: 'idle' }
  | { kind: 'scanning' }
  | { kind: 'found'; job: ScrapedJob }
  | { kind: 'saving'; job: ScrapedJob }
  | { kind: 'saved'; job: ScrapedJob }
  | { kind: 'error'; message: string }

type SiteState =
  | { kind: 'none' }
  | { kind: 'off'; id: SiteId }
  | { kind: 'requesting'; id: SiteId }
  | { kind: 'on'; id: SiteId; justEnabled: boolean }

/** Offers access to the current page's site when it is an optional site that is still off. */
function SiteCard({
  site,
  onEnable,
}: {
  site: SiteState
  onEnable: (id: SiteId) => void
}): ReactElement | null {
  if (site.kind === 'none') return null
  if (site.kind === 'on' && !site.justEnabled) return null
  const label = SITES[site.id].label
  return (
    <section className="card">
      <h2>{label}</h2>
      {site.kind === 'on' ? (
        <p className="ok">CVSpec is on for {label}. It loads on this page now.</p>
      ) : (
        <>
          <p className="muted">
            CVSpec only runs on {label} once you allow it. Chrome asks you to confirm.
          </p>
          <button
            type="button"
            className="btn btn--primary"
            disabled={site.kind === 'requesting'}
            onClick={() => onEnable(site.id)}
          >
            {site.kind === 'requesting' ? 'Waiting for Chrome...' : `Enable CVSpec on ${label}`}
          </button>
        </>
      )}
    </section>
  )
}

export function Popup(): ReactElement {
  const [site, setSite] = useState<SiteState>({ kind: 'none' })
  const [siteError, setSiteError] = useState<string | null>(null)
  const [auth, setAuth] = useState<AuthState | null>(null)
  const [recent, setRecent] = useState<Application[] | null>(null)
  const [scan, setScan] = useState<ScanState>({ kind: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const [fillError, setFillError] = useState<string | null>(null)
  const [filling, setFilling] = useState(false)

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

  useEffect(() => {
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const id = siteForUrl(tab?.url)
      if (!id) return
      const granted = (await siteAccess())[id]
      setSite(granted ? { kind: 'on', id, justEnabled: false } : { kind: 'off', id })
    })().catch(() => undefined)
  }, [])

  const enableSite = (id: SiteId) => {
    setSite({ kind: 'requesting', id })
    setSiteError(null)
    requestSite(id)
      .then((granted) => {
        if (granted) {
          setSite({ kind: 'on', id, justEnabled: true })
        } else {
          setSite({ kind: 'off', id })
          setSiteError(`Access to ${SITES[id].label} was not granted.`)
        }
      })
      .catch((err: unknown) => {
        setSite({ kind: 'off', id })
        setSiteError(err instanceof Error ? err.message : 'Could not enable this site')
      })
  }

  const scanPage = async () => {
    setScan({ kind: 'scanning' })
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id || !tab.url?.startsWith('http')) throw new Error('This page cannot be scanned.')
      let job = await extractWithAdapter(tab.id)
      if (!job) {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: scanJsonLdJobPosting,
        })
        job = (result?.result as ScrapedJob | null | undefined) ?? null
      }
      if (!job) {
        setScan({ kind: 'error', message: 'No job posting data found on this page.' })
        return
      }
      const board = job.board === 'other' ? boardForUrl(job.url) : job.board
      setScan({ kind: 'found', job: { ...job, board } })
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

  const fillThisPage = async () => {
    setFilling(true)
    setFillError(null)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id || !tab.url?.startsWith('http')) {
        throw new Error('CVSpec cannot run on this page.')
      }
      await injectFormHelper(tab.id)
      window.close()
    } catch (err) {
      setFillError(err instanceof Error ? err.message : 'CVSpec cannot run on this page.')
      setFilling(false)
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
        <button
          type="button"
          className="link popup__settings"
          onClick={() => void chrome.runtime.openOptionsPage()}
        >
          Sites
        </button>
      </header>

      <SiteCard site={site} onEnable={enableSite} />
      {siteError && <p className="error">{siteError}</p>}

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
                  On LinkedIn, Indeed, Glassdoor and {STATIC_BOARD_IDS.length - 3} more job boards the Save
                  and Tailor buttons appear next to Apply. On other job sites, scan the page for a
                  posting.
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
            <h2>Application form</h2>
            <p className="muted">
              Greenhouse and Lever forms show a Fill button automatically. On other application
              forms, fill your tailored resume and contact details from here.
            </p>
            {fillError && <p className="error">{fillError}</p>}
            <button
              type="button"
              className="btn btn--secondary"
              disabled={filling}
              onClick={() => void fillThisPage()}
            >
              {filling ? 'Starting...' : 'Fill this application'}
            </button>
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
