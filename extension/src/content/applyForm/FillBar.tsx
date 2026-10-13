import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { WEB_URL } from '../../shared/config'
import { ExtensionError, sendMessage } from '../../shared/messages'
import type { Application } from '../../shared/types'
import { isQueueTab, QueueLine, useQueueStatus } from '../ui/QueueLine'
import type { ApplyFormAdapter } from './adapters'
import type { WizardStep } from './adapters/types'
import { AnswersPanel } from './AnswersPanel'
import { fillForm, markForCandidate, type FillReport } from './fill'

export const SHOW_EVENT = 'cvspec:show-fill-bar'
const FILLED_KEY = 'cvspec-filled-application'
/** A fill older than this no longer marks the job as applied when a confirmation page loads. */
const FILLED_TTL_MS = 3 * 60 * 60 * 1000
const CONFIRMATION_POLL_MS = 1000
const GENERIC_SUBMIT_DELAY_MS = 1500
const PAGE_POLL_MS = 1000

/** Where a multi-step or sign-in-gated form currently is. */
interface PageView {
  signIn: boolean
  step: WizardStep | null
}

function readPage(adapter: ApplyFormAdapter): PageView {
  return { signIn: adapter.isSignIn?.() ?? false, step: adapter.currentStep?.() ?? null }
}

function pageKey(view: PageView): string {
  if (view.signIn) return 'sign-in'
  return view.step ? `${view.step.index}/${view.step.total}:${view.step.name}` : ''
}

function stepLabel(step: WizardStep): string {
  return `Step ${step.index} of ${step.total}${step.name ? `: ${step.name}` : ''}`
}

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
  if (report.coverLetterFileName) lines.push(`Attached ${report.coverLetterFileName}.`)
  if (report.coverLetterPasted) lines.push('Pasted your cover letter into the form.')
  if (report.filled.length > 0) {
    lines.push(`Filled ${report.filled.length} field${report.filled.length === 1 ? '' : 's'}.`)
  }
  if (report.kept.length > 0) {
    lines.push(
      `Kept ${report.kept.length} field${report.kept.length === 1 ? '' : 's'} that already had a value.`,
    )
  }
  if (
    report.filled.length === 0 &&
    !report.fileName &&
    !report.coverLetterFileName &&
    !report.coverLetterPasted
  ) {
    lines.push('Nothing could be filled automatically on this form.')
  }
  return lines
}

export function FillBar({ adapter }: { adapter: ApplyFormAdapter }): ReactElement | null {
  const [state, setState] = useState<BarState>({ kind: 'loading' })
  const [dismissed, setDismissed] = useState(false)
  const [fillCount, setFillCount] = useState(0)
  const [view, setView] = useState<PageView>(() => readPage(adapter))
  const viewKey = pageKey(view)
  const previousViewKey = useRef(viewKey)
  const tracksPages = adapter.isSignIn !== undefined || adapter.currentStep !== undefined
  const queue = useQueueStatus()
  const autoFilled = useRef<string | null>(null)
  const recordedUrl = useRef(false)

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

  /** Wizards and sign-in pages change in place: watch for the next step or a finished sign-in. */
  useEffect(() => {
    if (!tracksPages) return
    const timer = setInterval(() => {
      const next = readPage(adapter)
      setView((current) => (pageKey(current) === pageKey(next) ? current : next))
    }, PAGE_POLL_MS)
    return () => clearInterval(timer)
  }, [adapter, tracksPages])

  /** A new step gets a fresh offer to fill it. CVSpec never clicks Next itself. */
  useEffect(() => {
    if (previousViewKey.current === viewKey) return
    previousViewKey.current = viewKey
    const filled = recentFill()
    if (filled && adapter.isConfirmation()) {
      void markSubmitted(filled)
      return
    }
    setState((current) =>
      (current.kind === 'filled' || current.kind === 'error') && current.application
        ? { kind: 'linked', application: current.application }
        : current,
    )
  }, [viewKey, adapter, markSubmitted])

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

    const root = adapter.form()
    const form = root instanceof HTMLFormElement ? root : null
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
      if (adapter.isSignIn?.()) {
        throw new Error('Sign in yourself first. CVSpec fills the form once you are signed in.')
      }
      if (!adapter.isReady()) {
        throw new Error(
          "Couldn't find an application form on this page. Open the form, then click Fill again.",
        )
      }
      const pkg = await sendMessage({ type: 'GET_APPLY_PACKAGE', applicationId: application.id })
      const letter = pkg.application.cover_letter?.trim()
      const report = await fillForm(adapter, pkg, {
        coverLetter: letter
          ? {
              text: letter,
              fetchFile: (format) =>
                sendMessage({
                  type: 'GET_COVER_LETTER_FILE',
                  applicationId: application.id,
                  format,
                }),
            }
          : null,
      })
      rememberFill(application.id)
      setFillCount((count) => count + 1)
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

  /** The first time a linked form loads, remember its URL so the queue can open it directly. */
  const linkedApplication = state.kind === 'linked' ? state.application : null
  useEffect(() => {
    if (!linkedApplication || linkedApplication.apply_url || recordedUrl.current) return
    recordedUrl.current = true
    void sendMessage({
      type: 'SET_APPLY_URL',
      applicationId: linkedApplication.id,
      url: window.location.href,
    }).catch(() => undefined)
  }, [linkedApplication])

  /** On a tab the apply queue opened, fill each page or step once, then wait for the user. */
  const [queueStatus] = queue
  useEffect(() => {
    if (!linkedApplication || view.signIn || !isQueueTab(queueStatus)) return
    if (queueStatus?.phase !== 'active') return
    if (queueStatus.current?.applicationId !== linkedApplication.id) return
    const key = `${linkedApplication.id}|${window.location.href}|${viewKey}`
    if (autoFilled.current === key) return
    autoFilled.current = key
    void fill(linkedApplication)
  })

  if (dismissed || state.kind === 'loading') return null

  const signingIn =
    view.signIn && (state.kind === 'linked' || state.kind === 'pick' || state.kind === 'error')
  const step = view.signIn ? null : view.step
  const moreSteps = step !== null && step.index < step.total

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

          {signingIn && (
            <>
              <strong>Sign in yourself to continue</strong>
              <p className="cvs-muted">
                CVSpec never signs in for you and never sees or stores your password. Once you are
                signed in, it offers to fill each step of the application.
              </p>
            </>
          )}

          {!signingIn && state.kind === 'linked' && step && (
            <>
              <strong>
                Fill {stepLabel(step)} for {jobLabel(state.application)}?
              </strong>
              <p className="cvs-muted">
                CVSpec fills only this step: contact details, your tailored resume and draft
                answers for you to edit. You review it and click Next yourself, then CVSpec offers
                to fill the next step.
              </p>
            </>
          )}

          {!signingIn && state.kind === 'linked' && !step && (
            <>
              <strong>Fill this application for {jobLabel(state.application)}?</strong>
              <p className="cvs-muted">
                CVSpec attaches your tailored resume and cover letter, fills your contact details
                and drafts answers to the form&apos;s questions for you to edit. You review and
                submit.
              </p>
            </>
          )}

          {!signingIn && state.kind === 'pick' && (
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
              Building your tailored resume and cover letter, and filling the form...
            </div>
          )}

          {state.kind === 'filled' && (
            <>
              <strong>
                {step && moreSteps
                  ? `${stepLabel(step)} filled. Review it, then click Next yourself`
                  : 'Review the form, then submit it yourself'}
              </strong>
              {reportLines(state.report).map((line) => (
                <p key={line} className="cvs-muted">
                  {line}
                </p>
              ))}
              {state.report.fileProblem && (
                <div className="cvs-note">{state.report.fileProblem}</div>
              )}
              {state.report.coverLetterProblem && (
                <div className="cvs-note">{state.report.coverLetterProblem}</div>
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
              {state.report.sensitive > 0 && (
                <div className="cvs-note cvs-note--sensitive">
                  {state.report.sensitive} question{state.report.sensitive === 1 ? ' asks' : 's ask'}{' '}
                  for ID, employment-equity, health or similar personal information (outlined in
                  purple). Answer {state.report.sensitive === 1 ? 'it' : 'them'} yourself: CVSpec
                  never reads or stores these.
                </div>
              )}
              <AnswersPanel
                key={`${state.application.id}-${fillCount}`}
                adapter={adapter}
                applicationId={state.application.id}
                onFilled={(result) => {
                  const report = { ...state.report, answered: result.answered.length }
                  markForCandidate(adapter, report)
                  setState({ ...state, report })
                }}
              />
            </>
          )}

          {state.kind === 'submitted' && (
            <>
              <strong>Marked as applied</strong>
              <p className="cvs-muted">{jobLabel(state.application)} moved to Applied in CVSpec.</p>
            </>
          )}

          {!signingIn && state.kind === 'error' && (
            <div className="cvs-error">{state.message}</div>
          )}
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

      <QueueLine queue={queue} />

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

        {!signingIn && state.kind === 'linked' && (
          <>
            <button type="button" className="cvs-link" onClick={() => void loadPicker()}>
              Not this job
            </button>
            <button
              type="button"
              className="cvs-btn cvs-btn--primary"
              onClick={() => void fill(state.application)}
            >
              {step ? 'Fill this step' : 'Fill'}
            </button>
          </>
        )}

        {!signingIn && state.kind === 'pick' && state.options.length > 0 && (
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

        {!signingIn && state.kind === 'error' && (
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
