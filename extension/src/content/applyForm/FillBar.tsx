import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { WEB_URL } from '../../shared/config'
import { ExtensionError, sendMessage } from '../../shared/messages'
import type { Application } from '../../shared/types'
import type { ApplyFormAdapter } from './adapters'
import { fillForm, type FillReport } from './fill'

export const SHOW_EVENT = 'cvspec:show-fill-bar'
const FILLED_KEY = 'cvspec-filled-application'
/** A fill older than this no longer marks the job as applied when a confirmation page loads. */
const FILLED_TTL_MS = 3 * 60 * 60 * 1000
const CONFIRMATION_POLL_MS = 1000
const GENERIC_SUBMIT_DELAY_MS = 1500

type BarState =
  | { kind: 'loading' }
  | { kind: 'disconnected' }
  | { kind: 'linked'; application: Application }
  | { kind: 'pick'; options: Application[]; chosen: string }
  | { kind: 'filling'; application: Application }
  | { kind: 'filled'; application: Application; report: FillReport }
  | { kind: 'submitted'; application: Application }
  | { kind: 'error'; message: string; application: Application | null }

function rememberFill(applicationId: string): void {
  try {
    sessionStorage.setItem(FILLED_KEY, JSON.stringify({ applicationId, at: Date.now() }))
  } catch {
    // storage blocked: confirmation pages just won't be detected after navigation
  }
}

function recentFill(): string | null {
  try {
    const raw = sessionStorage.getItem(FILLED_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { applicationId?: string; at?: number }
    if (!parsed.applicationId || !parsed.at || Date.now() - parsed.at > FILLED_TTL_MS) return null
    return parsed.applicationId
  } catch {
    return null
  }
}

function forgetFill(): void {
  try {
    sessionStorage.removeItem(FILLED_KEY)
  } catch {
    // ignore
  }
}

function jobLabel(application: Application): string {
  return [application.title ?? 'Untitled role', application.company].filter(Boolean).join(' at ')
}

/** Saved jobs, most likely match for this page first. */
function rankForPage(applications: Application[]): Application[] {
  const page = `${document.title} ${window.location.href} ${
    document.querySelector('h1')?.textContent ?? ''
  }`.toLowerCase()
  const score = (application: Application) => {
    let total = 0
    const company = application.company?.trim().toLowerCase()
    if (company && (page.includes(company) || page.includes(company.replace(/\s+/g, '')))) {
      total += 3
    }
    for (const word of (application.title ?? '').toLowerCase().split(/\W+/)) {
      if (word.length > 3 && page.includes(word)) total += 1
    }
    return total
  }
  return applications
    .filter((application) => application.status === 'saved')
    .map((application) => ({ application, score: score(application) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(({ application }) => application)
}

function reportLines(report: FillReport): string[] {
  const lines: string[] = []
  if (report.fileName) lines.push(`Attached ${report.fileName}.`)
  if (report.filled.length > 0) {
    lines.push(`Filled ${report.filled.length} field${report.filled.length === 1 ? '' : 's'}.`)
  }
  if (report.kept.length > 0) {
    lines.push(
      `Kept ${report.kept.length} field${report.kept.length === 1 ? '' : 's'} that already had a value.`,
    )
  }
  if (report.filled.length === 0 && !report.fileName) {
    lines.push('Nothing could be filled automatically on this form.')
  }
  return lines
}

export function FillBar({ adapter }: { adapter: ApplyFormAdapter }): ReactElement | null {
  const [state, setState] = useState<BarState>({ kind: 'loading' })
  const [dismissed, setDismissed] = useState(false)

  const markSubmitted = useCallback(async (applicationId: string) => {
    forgetFill()
    try {
      const application = await sendMessage({ type: 'MARK_SUBMITTED', applicationId })
      setState({ kind: 'submitted', application })
      setDismissed(false)
    } catch {
      // the status can still be set by hand in CVSpec
    }
  }, [])

  const loadPicker = useCallback(async () => {
    try {
      const options = rankForPage(await sendMessage({ type: 'LIST_APPLICATIONS' }))
      setState({ kind: 'pick', options, chosen: options[0]?.id ?? '' })
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not load your saved jobs',
        application: null,
      })
    }
  }, [])

  useEffect(() => {
    void (async () => {
      let connected = false
      try {
        connected = (await sendMessage({ type: 'GET_AUTH' })).connected
      } catch {
        connected = false
      }
      if (!connected) {
        setState({ kind: 'disconnected' })
        return
      }

      const filled = recentFill()
      if (filled && adapter.isConfirmation()) {
        await markSubmitted(filled)
        return
      }

      try {
        const application = await sendMessage({ type: 'GET_APPLY_CONTEXT' })
        if (application) setState({ kind: 'linked', application })
        else await loadPicker()
      } catch (err) {
        if (err instanceof ExtensionError && err.unauthenticated) {
          setState({ kind: 'disconnected' })
          return
        }
        await loadPicker()
      }
    })()
  }, [adapter, loadPicker, markSubmitted])

  useEffect(() => {
    const show = () => setDismissed(false)
    window.addEventListener(SHOW_EVENT, show)
    return () => window.removeEventListener(SHOW_EVENT, show)
  }, [])

  /** After filling, watch for the confirmation view (and, on generic forms, the submit event). */
  useEffect(() => {
    if (state.kind !== 'filled') return
    const applicationId = state.application.id
    let done = false
    const finish = () => {
      if (done) return
      done = true
      void markSubmitted(applicationId)
    }

    const timer = setInterval(() => {
      if (adapter.isConfirmation()) finish()
    }, CONFIRMATION_POLL_MS)

    const form = adapter.form()
    let submitTimer: ReturnType<typeof setTimeout> | null = null
    const onSubmit = () => {
      if (adapter.system !== 'generic' || !form?.checkValidity()) return
      submitTimer = setTimeout(finish, GENERIC_SUBMIT_DELAY_MS)
    }
    form?.addEventListener('submit', onSubmit)

    return () => {
      done = true
      clearInterval(timer)
      if (submitTimer) clearTimeout(submitTimer)
      form?.removeEventListener('submit', onSubmit)
    }
  }, [state, adapter, markSubmitted])

  const fill = async (application: Application) => {
    setState({ kind: 'filling', application })
    try {
      if (!adapter.isReady()) {
        throw new Error(
          "Couldn't find an application form on this page. Open the form, then click Fill again.",
        )
      }
      const pkg = await sendMessage({ type: 'GET_APPLY_PACKAGE', applicationId: application.id })
      const report = await fillForm(adapter, pkg)
      rememberFill(application.id)
      setState({ kind: 'filled', application: pkg.application, report })
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not fill this form',
        application,
      })
    }
  }

  const fillChosen = async (applicationId: string) => {
    try {
      const application = await sendMessage({ type: 'SET_APPLY_CONTEXT', applicationId })
      await fill(application)
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not link this form to the job',
        application: null,
      })
    }
  }

  if (dismissed || state.kind === 'loading') return null

  return (
    <div className="cvs-fill" role="region" aria-label="CVSpec application helper">
      <div className="cvs-fill__head">
        <span className="cvs-fill__brand" aria-hidden>
          CV
        </span>
        <div className="cvs-fill__body">
          {state.kind === 'disconnected' && (
            <>
              <strong>Connect CVSpec to fill this application</strong>
              <p className="cvs-muted">
                Log in to CVSpec and the extension connects automatically.
              </p>
            </>
          )}

          {state.kind === 'linked' && (
            <>
              <strong>Fill this application for {jobLabel(state.application)}?</strong>
              <p className="cvs-muted">
                CVSpec attaches your tailored resume and fills your contact details. You review and
                submit.
              </p>
            </>
          )}

          {state.kind === 'pick' && (
            <>
              <strong>Which saved job is this application for?</strong>
              {state.options.length === 0 ? (
                <p className="cvs-muted">
                  No saved jobs waiting to be applied to. Save the job in CVSpec and pick edits
                  under Tailor before applying first.
                </p>
              ) : (
                <label className="cvs-field cvs-fill__pick">
                  <span className="cvs-visually-hidden">Saved job</span>
                  <select
                    value={state.chosen}
                    onChange={(event) => setState({ ...state, chosen: event.target.value })}
                  >
                    {state.options.map((application) => (
                      <option key={application.id} value={application.id}>
                        {jobLabel(application)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}

          {state.kind === 'filling' && (
            <div className="cvs-loading cvs-fill__loading">
              <span className="cvs-spinner" aria-hidden />
              Building your tailored resume and filling the form...
            </div>
          )}

          {state.kind === 'filled' && (
            <>
              <strong>Review the form, then submit it yourself</strong>
              {reportLines(state.report).map((line) => (
                <p key={line} className="cvs-muted">
                  {line}
                </p>
              ))}
              {state.report.fileProblem && (
                <div className="cvs-note">{state.report.fileProblem}</div>
              )}
              {state.report.unappliedEdits > 0 && (
                <div className="cvs-note">
                  {state.report.unappliedEdits} of your chosen edits could not be placed in the
                  resume file.
                </div>
              )}
              {state.report.needsInput > 0 && (
                <div className="cvs-note">
                  {state.report.needsInput} required field
                  {state.report.needsInput === 1 ? ' needs' : 's need'} your answer (outlined in
                  orange).
                </div>
              )}
            </>
          )}

          {state.kind === 'submitted' && (
            <>
              <strong>Marked as applied</strong>
              <p className="cvs-muted">{jobLabel(state.application)} moved to Applied in CVSpec.</p>
            </>
          )}

          {state.kind === 'error' && <div className="cvs-error">{state.message}</div>}
        </div>
        <button
          type="button"
          className="cvs-icon-btn"
          onClick={() => setDismissed(true)}
          aria-label="Hide CVSpec"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
      </div>

      <div className="cvs-fill__actions">
        {state.kind === 'disconnected' && (
          <a
            className="cvs-btn cvs-btn--primary"
            href={`${WEB_URL}/app`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Connect to CVSpec
          </a>
        )}

        {state.kind === 'linked' && (
          <>
            <button type="button" className="cvs-link" onClick={() => void loadPicker()}>
              Not this job
            </button>
            <button
              type="button"
              className="cvs-btn cvs-btn--primary"
              onClick={() => void fill(state.application)}
            >
              Fill
            </button>
          </>
        )}

        {state.kind === 'pick' && state.options.length > 0 && (
          <button
            type="button"
            className="cvs-btn cvs-btn--primary"
            disabled={!state.chosen}
            onClick={() => void fillChosen(state.chosen)}
          >
            Fill
          </button>
        )}

        {state.kind === 'filled' && (
          <>
            <a
              className="cvs-link"
              href={`${WEB_URL}/app/profile`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Edit profile
            </a>
            <button
              type="button"
              className="cvs-btn cvs-btn--secondary"
              onClick={() => void fill(state.application)}
            >
              Fill again
            </button>
          </>
        )}

        {state.kind === 'error' && (
          <button
            type="button"
            className="cvs-btn cvs-btn--secondary"
            onClick={() => void (state.application ? fill(state.application) : loadPicker())}
          >
            Try again
          </button>
        )}
      </div>
    </div>
  )
}
