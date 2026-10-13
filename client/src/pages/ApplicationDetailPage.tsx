import { useEffect, useState, type ReactElement } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, EmptyState } from '../components/Layout'
import { useOnline } from '../hooks/useOnline'
import {
  downloadCoverLetter,
  draftCoverLetter,
  getApplication,
  getCoverLetter,
  listApplicationAnswers,
  saveApplicationAnswers,
  saveCoverLetter,
} from '../lib/api'
import { saveBlob } from '../lib/download'
import type {
  Application,
  ApplicationAnswer,
  CoverLetterFormat,
  CoverLetterLength,
  CoverLetterTone,
} from '../types'

type Tab = 'tailoring' | 'cover-letter' | 'answers'

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'tailoring', label: 'Tailoring' },
  { value: 'cover-letter', label: 'Cover letter' },
  { value: 'answers', label: 'Answers' },
]

const MAX_LETTER = 8000

const SOURCE_LABELS: Record<ApplicationAnswer['source'], string> = {
  bank: 'From your saved answers',
  ai: 'Drafted by AI',
  user: 'Edited by you',
}

function TailoringTab({ item }: { item: Application }): ReactElement {
  const comparison = item.comparison
  if (!comparison) {
    return (
      <EmptyState
        title="Not scored yet"
        text="CVSpec compares this job with your latest resume when you save it. Run a comparison to see the match and suggested edits."
        action={
          <Link className="btn btn-primary" to="/app/compare">
            Compare now
          </Link>
        }
      />
    )
  }
  const recommendations = comparison.recommendations ?? []
  const chosen = new Set(item.tailored_recommendations ?? [])
  return (
    <div className="panel panel-pad form-stack">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">{Math.round(Number(comparison.match_score))}% match</h2>
          <p className="panel-sub">
            {chosen.size > 0
              ? `${chosen.size} of ${recommendations.length} suggested ${recommendations.length === 1 ? 'edit' : 'edits'} chosen for the tailored resume.`
              : 'No edits chosen yet. Pick them on the comparison or in the extension before you apply.'}
          </p>
        </div>
        <Link className="btn btn-secondary btn-sm" to={`/app/history/${comparison.id}`}>
          Open comparison
        </Link>
      </div>
      {comparison.missing_skills.length > 0 && (
        <p className="field-hint">Missing skills: {comparison.missing_skills.join(', ')}</p>
      )}
      <div className="rec-list">
        {recommendations.map((rec, index) => (
          <article
            key={`${rec.section}-${index}`}
            className={`rec-item${chosen.has(index) ? ' is-selected' : ''}`}
          >
            <div className="rec-item__tag">
              {rec.section}
              {chosen.has(index) ? ' · chosen' : ''}
            </div>
            <h4>{rec.suggestion}</h4>
            <p>{rec.rationale}</p>
          </article>
        ))}
      </div>
    </div>
  )
}

function CoverLetterTab({
  item,
  online,
}: {
  item: Application
  online: boolean
}): ReactElement {
  const [text, setText] = useState('')
  const [saved, setSaved] = useState('')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [tone, setTone] = useState<CoverLetterTone>('professional')
  const [length, setLength] = useState<CoverLetterLength>('medium')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'draft' | 'save' | CoverLetterFormat | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getCoverLetter(item.id)
      .then((letter) => {
        if (!alive) return
        setText(letter.coverLetter ?? '')
        setSaved(letter.coverLetter ?? '')
        setUpdatedAt(letter.updatedAt)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load the cover letter')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [item.id])

  const dirty = text.trim() !== saved.trim()

  const run = async (kind: NonNullable<typeof busy>, action: () => Promise<void>) => {
    setBusy(kind)
    setError(null)
    setNotice(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  const generate = () =>
    run('draft', async () => {
      if (
        saved.trim() &&
        !window.confirm('Replace your current cover letter with a new draft?')
      ) {
        return
      }
      const letter = await draftCoverLetter(item.id, { tone, length })
      setText(letter.coverLetter ?? '')
      setSaved(letter.coverLetter ?? '')
      setUpdatedAt(letter.updatedAt)
      setNotice('Draft ready. Read it carefully and edit anything that is not quite right.')
    })

  const save = () =>
    run('save', async () => {
      const letter = await saveCoverLetter(item.id, text)
      setSaved(letter.coverLetter ?? '')
      setText(letter.coverLetter ?? '')
      setUpdatedAt(letter.updatedAt)
      setNotice('Cover letter saved.')
    })

  const download = (format: CoverLetterFormat) =>
    run(format, async () => {
      if (dirty) {
        const letter = await saveCoverLetter(item.id, text)
        setSaved(letter.coverLetter ?? '')
        setUpdatedAt(letter.updatedAt)
      }
      const file = await downloadCoverLetter(item.id, format)
      saveBlob(file.blob, file.fileName)
    })

  if (loading) return <div className="loading-block">Loading cover letter...</div>

  return (
    <div className="panel panel-pad form-stack">
      <div>
        <h2 className="panel-title">Cover letter</h2>
        <p className="panel-sub">
          Drafted from your resume, the edits you chose and this job. CVSpec keeps the text with
          this job and builds the DOCX or PDF when you download it; the files are not stored.
        </p>
      </div>

      <div className="cover-letter__controls">
        <label className="field-inline">
          <span>Tone</span>
          <select
            className="select"
            value={tone}
            disabled={busy !== null}
            onChange={(e) => setTone(e.target.value as CoverLetterTone)}
          >
            <option value="professional">Professional</option>
            <option value="warm">Warm</option>
            <option value="concise">Concise</option>
          </select>
        </label>
        <label className="field-inline">
          <span>Length</span>
          <select
            className="select"
            value={length}
            disabled={busy !== null}
            onChange={(e) => setLength(e.target.value as CoverLetterLength)}
          >
            <option value="short">Short</option>
            <option value="medium">Medium</option>
            <option value="long">Long</option>
          </select>
        </label>
        <Button variant="secondary" disabled={!online || busy !== null} onClick={() => void generate()}>
          {busy === 'draft' ? 'Drafting...' : saved.trim() ? 'Draft again' : 'Draft cover letter'}
        </Button>
      </div>

      <textarea
        className="textarea cover-letter__text"
        rows={16}
        maxLength={MAX_LETTER}
        aria-label="Cover letter"
        placeholder="Draft a cover letter, or write your own here."
        value={text}
        disabled={busy !== null}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="field-hint">
        {text.length} / {MAX_LETTER} characters
        {updatedAt ? ` · Last saved ${new Date(updatedAt).toLocaleString()}` : ''}
      </div>

      {error && <div className="form-error">{error}</div>}
      {notice && <div className="form-success">{notice}</div>}

      <div className="cover-letter__actions">
        <Button disabled={!online || busy !== null || !dirty} onClick={() => void save()}>
          {busy === 'save' ? 'Saving...' : 'Save'}
        </Button>
        <Button
          variant="secondary"
          disabled={!online || busy !== null || !text.trim()}
          onClick={() => void download('docx')}
        >
          {busy === 'docx' ? 'Building...' : 'Download DOCX'}
        </Button>
        <Button
          variant="secondary"
          disabled={!online || busy !== null || !text.trim()}
          onClick={() => void download('pdf')}
        >
          {busy === 'pdf' ? 'Building...' : 'Download PDF'}
        </Button>
      </div>
      {!online && <p className="field-hint">Drafting and downloading are disabled while offline.</p>}
    </div>
  )
}

function AnswersTab({ item, online }: { item: Application; online: boolean }): ReactElement {
  const [answers, setAnswers] = useState<ApplicationAnswer[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    listApplicationAnswers(item.id)
      .then((list) => {
        if (!alive) return
        setAnswers(list)
        setDrafts(Object.fromEntries(list.map((answer) => [answer.questionKey, answer.answer])))
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load answers')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [item.id])

  const changed = answers.filter((answer) => (drafts[answer.questionKey] ?? '') !== answer.answer)

  const save = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const list = await saveApplicationAnswers(
        item.id,
        changed.map((answer) => ({
          questionKey: answer.questionKey,
          questionLabel: answer.questionLabel,
          answer: drafts[answer.questionKey] ?? '',
        })),
      )
      setAnswers(list)
      setDrafts(Object.fromEntries(list.map((answer) => [answer.questionKey, answer.answer])))
      setNotice('Answers saved. The extension uses these next time you open this application form.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the answers')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="loading-block">Loading answers...</div>
  if (answers.length === 0) {
    return (
      <EmptyState
        title="No answers yet"
        text="When you open this job's application form, the CVSpec extension drafts answers to its questions. They appear here so you can review and edit them."
      />
    )
  }

  return (
    <div className="panel panel-pad form-stack">
      <div>
        <h2 className="panel-title">Answers for this application</h2>
        <p className="panel-sub">
          Clear an answer to delete it. Questions about ID numbers, race, gender, disability,
          health or criminal records are never stored, so they do not appear here.
        </p>
      </div>
      {answers.map((answer) => (
        <div key={answer.questionKey} className="saved-answer">
          <label htmlFor={`app-answer-${answer.questionKey}`} className="saved-answer__question">
            {answer.questionLabel}
          </label>
          <textarea
            id={`app-answer-${answer.questionKey}`}
            className="textarea"
            rows={3}
            maxLength={4000}
            value={drafts[answer.questionKey] ?? ''}
            disabled={saving}
            onChange={(e) => setDrafts({ ...drafts, [answer.questionKey]: e.target.value })}
          />
          <div className="field-hint">{SOURCE_LABELS[answer.source]}</div>
        </div>
      ))}
      {error && <div className="form-error">{error}</div>}
      {notice && <div className="form-success">{notice}</div>}
      <div>
        <Button disabled={!online || saving || changed.length === 0} onClick={() => void save()}>
          {saving ? 'Saving...' : `Save ${changed.length || ''} ${changed.length === 1 ? 'change' : 'changes'}`}
        </Button>
      </div>
    </div>
  )
}

export function ApplicationDetailPage(): ReactElement {
  const { id } = useParams()
  const online = useOnline()
  const [item, setItem] = useState<Application | null>(null)
  const [tab, setTab] = useState<Tab>('tailoring')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let alive = true
    setLoading(true)
    getApplication(id)
      .then((data) => {
        if (alive) setItem(data)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load the application')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [id])

  if (loading) return <div className="loading-block">Loading application...</div>
  if (error || !item) {
    return (
      <EmptyState
        title="Application unavailable"
        text={error ?? 'This application could not be found.'}
        action={
          <Link className="btn btn-secondary" to="/app/applications">
            Back to applications
          </Link>
        }
      />
    )
  }

  const title = item.title ?? item.job_spec?.parsed_json?.title ?? 'Untitled role'

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{title}</h1>
          <p>
            {[item.company, item.location].filter(Boolean).join(' · ')}
            {item.company || item.location ? ' · ' : ''}
            <a href={item.source_url} target="_blank" rel="noopener noreferrer">
              View posting
            </a>
          </p>
        </div>
        <Link className="btn btn-secondary" to="/app/applications">
          Back
        </Link>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            role="tab"
            className={`tab${tab === entry.value ? ' is-active' : ''}`}
            aria-selected={tab === entry.value}
            onClick={() => setTab(entry.value)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'tailoring' && <TailoringTab item={item} />}
      {tab === 'cover-letter' && <CoverLetterTab item={item} online={online} />}
      {tab === 'answers' && <AnswersTab item={item} online={online} />}
    </div>
  )
}
