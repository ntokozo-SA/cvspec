import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { BOARDS } from '../../shared/boards'
import { LAST_RESUME_KEY, WEB_URL } from '../../shared/config'
import { sendMessage } from '../../shared/messages'
import type {
  Application,
  AuthState,
  Comparison,
  Recommendation,
  ResumeSummary,
  TailoredScore,
  Tailoring,
} from '../../shared/types'
import type { JobBoardAdapter } from '../adapters'
import { CoverLetterSection } from './CoverLetterSection'
import { downloadFile } from './download'

const SAVE_DELAY_MS = 600

function ScoreRing({ score }: { score: number }): ReactElement {
  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  return (
    <div
      className="cvs-score"
      style={{ ['--score' as string]: `${clamped}%` }}
      aria-label={`Match score ${clamped} percent`}
    >
      <span>
        {clamped}
        <small>%</small>
      </span>
    </div>
  )
}

function SkillChips({
  skills,
  variant,
}: {
  skills: string[]
  variant: 'matched' | 'missing'
}): ReactElement {
  if (skills.length === 0) return <p className="cvs-muted">None listed.</p>
  return (
    <div className="cvs-chips">
      {skills.map((skill) => (
        <span key={skill} className={`cvs-chip cvs-chip--${variant}`}>
          {skill}
        </span>
      ))}
    </div>
  )
}

function RecommendationCard({
  rec,
  checked,
  onToggle,
}: {
  rec: Recommendation
  checked: boolean
  onToggle: () => void
}): ReactElement {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(rec.suggestion)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <article className={`cvs-rec${checked ? ' is-selected' : ''}`}>
      <label className="cvs-rec__pick">
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <span className="cvs-rec__tag">{rec.section}</span>
      </label>
      {rec.original && (
        <div className="cvs-rec__block cvs-rec__block--before">
          <div className="cvs-rec__label">Current</div>
          <p>{rec.original}</p>
        </div>
      )}
      <div className="cvs-rec__block cvs-rec__block--after">
        <div className="cvs-rec__label">
          {rec.original ? 'Suggested' : 'Add'}
          <button type="button" className="cvs-link" onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p>{rec.suggestion}</p>
      </div>
      <p className="cvs-rec__why">{rec.rationale}</p>
    </article>
  )
}

async function readLastResumeId(): Promise<string | null> {
  const result = await chrome.storage.local.get(LAST_RESUME_KEY)
  const value = result[LAST_RESUME_KEY]
  return typeof value === 'string' ? value : null
}

function unappliedNote(count: number): string | null {
  if (count === 0) return null
  return count === 1
    ? '1 selected edit could not be placed in your resume. Copy it in manually.'
    : `${count} selected edits could not be placed in your resume. Copy them in manually.`
}

export function TailorPanel({
  open,
  auth,
  adapter,
  application,
  saveError,
  onApplicationChange,
  onClose,
}: {
  open: boolean
  auth: AuthState | null
  adapter: JobBoardAdapter
  application: Application | null
  saveError: string | null
  onApplicationChange: (next: Application) => void
  onClose: () => void
}): ReactElement | null {
  const [resumes, setResumes] = useState<ResumeSummary[] | null>(null)
  const [resumeId, setResumeId] = useState<string | null>(null)
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [selectionNote, setSelectionNote] = useState<string | null>(null)
  const [tailoredScore, setTailoredScore] = useState<TailoredScore | null>(null)
  const [scoring, setScoring] = useState(false)
  const [busy, setBusy] = useState<'download' | 'apply' | null>(null)
  const [applyNote, setApplyNote] = useState<string | null>(null)
  const initializedFor = useRef<string | null>(null)
  const selectionFor = useRef<string | null>(null)
  const applicationRef = useRef(application)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSave = useRef<Promise<void> | null>(null)
  const scoreRequest = useRef(0)

  useEffect(() => {
    applicationRef.current = application
  }, [application])

  const analyze = useCallback(
    async (nextResumeId: string) => {
      const current = applicationRef.current
      if (!current) return
      setAnalyzing(true)
      setError(null)
      try {
        const result = await sendMessage({
          type: 'ANALYZE',
          applicationId: current.id,
          resumeId: nextResumeId,
        })
        setComparison(result)
        onApplicationChange({
          ...current,
          comparison: result,
          comparison_id: result.id,
          resume_id: nextResumeId,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not score this job')
      } finally {
        setAnalyzing(false)
      }
    },
    [onApplicationChange],
  )

  useEffect(() => {
    if (!open || !auth?.connected || !application) return
    if (initializedFor.current === application.id) return
    initializedFor.current = application.id

    void (async () => {
      setError(null)
      try {
        const all = await sendMessage({ type: 'LIST_RESUMES' })
        const parsed = all.filter((resume) => resume.parsed_json != null)
        setResumes(parsed)
        if (parsed.length === 0) return

        const stored = await readLastResumeId()
        const pick =
          parsed.find((r) => r.id === stored)?.id ??
          parsed.find((r) => r.id === application.resume_id)?.id ??
          parsed[0].id
        setResumeId(pick)

        if (application.comparison && application.comparison.resume_id === pick) {
          setComparison(application.comparison)
        } else {
          await analyze(pick)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load your resumes')
      }
    })()
  }, [open, auth, application, analyze])

  const scoreSelection = useCallback(async (tailoring: Tailoring | null) => {
    const request = ++scoreRequest.current
    if (!tailoring) {
      setTailoredScore(null)
      setScoring(false)
      return
    }
    setScoring(true)
    try {
      const result = await sendMessage({ type: 'TAILORED_SCORE', tailoring })
      if (request === scoreRequest.current) setTailoredScore(result)
    } catch {
      if (request === scoreRequest.current) setTailoredScore(null)
    } finally {
      if (request === scoreRequest.current) setScoring(false)
    }
  }, [])

  /** Restores the saved selection when it belongs to the comparison on screen. */
  useEffect(() => {
    if (!comparison || selectionFor.current === comparison.id) return
    selectionFor.current = comparison.id
    const current = applicationRef.current
    const saved = current?.tailored_recommendations ?? []
    const count = comparison.recommendations?.length ?? 0

    if (current?.tailored_comparison_id === comparison.id && saved.length > 0) {
      const restored = saved.filter((index) => index < count)
      setSelected(restored)
      setSelectionNote(null)
      void scoreSelection(
        restored.length > 0 ? { comparisonId: comparison.id, recommendations: restored } : null,
      )
      return
    }

    setSelected([])
    setTailoredScore(null)
    setSelectionNote(
      current?.tailored_comparison_id
        ? 'This job was re-analyzed, so your earlier picks no longer apply. Choose the edits to include again.'
        : null,
    )
  }, [comparison, scoreSelection])

  const persistSelection = useCallback(
    (next: number[]): Promise<void> => {
      const current = applicationRef.current
      if (!current || !comparison) return Promise.resolve()
      const tailoring =
        next.length > 0 ? { comparisonId: comparison.id, recommendations: next } : null
      const run = sendMessage({ type: 'SAVE_TAILORING', applicationId: current.id, tailoring })
        .then((updated) => {
          onApplicationChange({
            ...updated,
            comparison: updated.comparison ?? applicationRef.current?.comparison ?? comparison,
          })
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Could not save your choices')
          throw err
        })
      pendingSave.current = run.catch(() => undefined)
      return run
    },
    [comparison, onApplicationChange],
  )

  const toggle = (index: number) => {
    if (!comparison) return
    const next = selected.includes(index)
      ? selected.filter((item) => item !== index)
      : [...selected, index].sort((a, b) => a - b)
    setSelected(next)
    setSelectionNote(null)
    setApplyNote(null)
    void scoreSelection(
      next.length > 0 ? { comparisonId: comparison.id, recommendations: next } : null,
    )
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      void persistSelection(next).catch(() => undefined)
    }, SAVE_DELAY_MS)
  }

  /** Saves any pending selection now, so the form tab reads the latest choice. */
  const flushSelection = async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
      await persistSelection(selected)
      return
    }
    await pendingSave.current
  }

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    },
    [],
  )

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const onResumeChange = (nextId: string) => {
    setResumeId(nextId)
    void chrome.storage.local.set({ [LAST_RESUME_KEY]: nextId })
    void analyze(nextId)
  }

  const markApplied = async () => {
    if (!application) return
    setUpdatingStatus(true)
    try {
      const updated = await sendMessage({
        type: 'UPDATE_STATUS',
        applicationId: application.id,
        status: 'applied',
      })
      onApplicationChange({ ...updated, comparison: updated.comparison ?? comparison })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update status')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const download = async () => {
    if (!comparison || selected.length === 0) return
    setBusy('download')
    setApplyNote(null)
    try {
      const file = await sendMessage({
        type: 'DOWNLOAD_TAILORED',
        tailoring: { comparisonId: comparison.id, recommendations: selected },
      })
      downloadFile(file)
      setApplyNote(unappliedNote(file.unapplied.length))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build your tailored resume')
    } finally {
      setBusy(null)
    }
  }

  const applyWithTailored = async () => {
    if (!application || !comparison || selected.length === 0) return
    setBusy('apply')
    setError(null)
    setApplyNote(null)
    try {
      await flushSelection()
      if (adapter.isBuiltInApply()) {
        const label = application.board === 'other' ? 'this site' : BOARDS[application.board].label
        setApplyNote(
          `This job uses ${label}'s built-in application form, which CVSpec can't fill. Download your tailored resume and upload it there instead.`,
        )
        return
      }
      await sendMessage({ type: 'ARM_APPLY', applicationId: application.id })
      const button = adapter.applyButton()
      if (button) {
        button.click()
        setApplyNote(
          'Opening the application form. On Greenhouse, Lever and the application systems you have enabled (such as Workday), click Fill in the CVSpec bar. On other sites, use Fill this application in the CVSpec extension menu.',
        )
      } else {
        setApplyNote(
          "Couldn't find this page's Apply button. Click Apply now: CVSpec links the form that opens in the next minute to this job.",
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the application')
    } finally {
      setBusy(null)
    }
  }

  if (!open) return null

  const selectedResume = resumes?.find((r) => r.id === resumeId)
  const recommendations = comparison?.recommendations ?? []

  return (
    <aside className="cvs-panel" role="dialog" aria-label="Tailor your resume for this job">
      <header className="cvs-panel__head">
        <div>
          <div className="cvs-eyebrow">CVSpec</div>
          <h2>Tailor for this job</h2>
          {application && (
            <p className="cvs-muted">
              {[application.title, application.company].filter(Boolean).join(' at ')}
            </p>
          )}
        </div>
        <button type="button" className="cvs-icon-btn" onClick={onClose} aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
      </header>

      <div className="cvs-panel__body">
        {auth && !auth.connected ? (
          <div className="cvs-empty">
            <h3>Connect your CVSpec account</h3>
            <p>
              Log in to CVSpec in a new tab. The extension connects automatically, then you can
              come back here and tailor your resume.
            </p>
            <a
              className="cvs-btn cvs-btn--primary"
              href={`${WEB_URL}/app`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Connect to CVSpec
            </a>
          </div>
        ) : !application ? (
          saveError ? (
            <div className="cvs-error">{saveError}</div>
          ) : (
            <p className="cvs-muted">Saving this job...</p>
          )
        ) : resumes && resumes.length === 0 ? (
          <div className="cvs-empty">
            <h3>No parsed resume yet</h3>
            <p>Upload a resume in CVSpec so it can be scored against this posting.</p>
            <a
              className="cvs-btn cvs-btn--primary"
              href={`${WEB_URL}/app/resumes`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Upload a resume
            </a>
          </div>
        ) : (
          <>
            {resumes && resumes.length > 0 && (
              <label className="cvs-field">
                <span>Resume</span>
                <select
                  value={resumeId ?? ''}
                  onChange={(event) => onResumeChange(event.target.value)}
                  disabled={analyzing}
                >
                  {resumes.map((resume) => (
                    <option key={resume.id} value={resume.id}>
                      {resume.file_name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {error && <div className="cvs-error">{error}</div>}

            {analyzing || !resumes ? (
              <div className="cvs-loading">
                <span className="cvs-spinner" aria-hidden />
                {selectedResume
                  ? `Scoring ${selectedResume.file_name} against this posting...`
                  : 'Loading your resumes...'}
              </div>
            ) : comparison ? (
              <>
                <section className="cvs-summary">
                  <ScoreRing score={Number(comparison.match_score)} />
                  <div>
                    <div className="cvs-eyebrow">Match against required skills</div>
                    <p className="cvs-muted">
                      {(comparison.missing_skills ?? []).length === 0
                        ? 'Every required skill is covered. Use the edits below to sharpen wording.'
                        : `${(comparison.missing_skills ?? []).length} required skills are not clearly shown on this resume.`}
                    </p>
                  </div>
                </section>

                <section className="cvs-section">
                  <h3>Missing keywords</h3>
                  <SkillChips skills={comparison.missing_skills ?? []} variant="missing" />
                </section>

                <section className="cvs-section">
                  <h3>Already covered</h3>
                  <SkillChips skills={comparison.matched_skills ?? []} variant="matched" />
                </section>

                <section className="cvs-section">
                  <h3>Recommended edits</h3>
                  <p className="cvs-muted cvs-section__hint">
                    Tick the edits to include in the resume you apply with.
                  </p>
                  {selectionNote && <div className="cvs-note">{selectionNote}</div>}
                  <div className="cvs-recs">
                    {recommendations.map((rec, index) => (
                      <RecommendationCard
                        key={`${rec.section}-${index}`}
                        rec={rec}
                        checked={selected.includes(index)}
                        onToggle={() => toggle(index)}
                      />
                    ))}
                  </div>
                </section>

                <CoverLetterSection
                  application={application}
                  onApplicationChange={onApplicationChange}
                />
              </>
            ) : null}
          </>
        )}
      </div>

      {application && auth?.connected && comparison && recommendations.length > 0 && (
        <section className="cvs-panel__apply" aria-label="Apply with a tailored resume">
          <div className="cvs-apply__summary">
            <span>
              {selected.length === 0
                ? 'No edits selected'
                : `${selected.length} edit${selected.length === 1 ? '' : 's'} selected`}
            </span>
            {selected.length > 0 && (
              <span className="cvs-apply__score">
                {scoring
                  ? 'Rescoring...'
                  : tailoredScore
                    ? `Match ${Math.round(tailoredScore.previousScore)}% to ${Math.round(tailoredScore.matchScore)}%`
                    : null}
              </span>
            )}
          </div>
          {applyNote && <div className="cvs-note">{applyNote}</div>}
          <div className="cvs-apply__buttons">
            <button
              type="button"
              className="cvs-btn cvs-btn--secondary"
              onClick={() => void download()}
              disabled={selected.length === 0 || busy !== null}
            >
              {busy === 'download' ? 'Building...' : 'Download tailored resume'}
            </button>
            <button
              type="button"
              className="cvs-btn cvs-btn--primary"
              onClick={() => void applyWithTailored()}
              disabled={selected.length === 0 || busy !== null}
            >
              {busy === 'apply' ? 'Preparing...' : 'Apply with tailored resume'}
            </button>
          </div>
        </section>
      )}

      {application && auth?.connected && (
        <footer className="cvs-panel__foot">
          {comparison && (
            <a
              className="cvs-btn cvs-btn--secondary"
              href={`${WEB_URL}/app/history/${comparison.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open full comparison
            </a>
          )}
          {application.status === 'saved' ? (
            <button
              type="button"
              className="cvs-btn cvs-btn--primary"
              onClick={() => void markApplied()}
              disabled={updatingStatus}
            >
              {updatingStatus ? 'Updating...' : 'Mark as applied'}
            </button>
          ) : (
            <span className="cvs-status">Status: {application.status}</span>
          )}
        </footer>
      )}
    </aside>
  )
}
