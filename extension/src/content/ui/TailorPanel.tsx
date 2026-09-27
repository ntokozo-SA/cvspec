import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { LAST_RESUME_KEY, WEB_URL } from '../../shared/config'
import { sendMessage } from '../../shared/messages'
import type {
  Application,
  AuthState,
  Comparison,
  Recommendation,
  ResumeSummary,
} from '../../shared/types'

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

function RecommendationCard({ rec }: { rec: Recommendation }): ReactElement {
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
    <article className="cvs-rec">
      <div className="cvs-rec__tag">{rec.section}</div>
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

export function TailorPanel({
  open,
  auth,
  application,
  saveError,
  onApplicationChange,
  onClose,
}: {
  open: boolean
  auth: AuthState | null
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
  const initializedFor = useRef<string | null>(null)
  const applicationRef = useRef(application)

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

  if (!open) return null

  const selectedResume = resumes?.find((r) => r.id === resumeId)

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
                  <div className="cvs-recs">
                    {(comparison.recommendations ?? []).map((rec, index) => (
                      <RecommendationCard key={`${rec.section}-${index}`} rec={rec} />
                    ))}
                  </div>
                </section>
              </>
            ) : null}
          </>
        )}
      </div>

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
