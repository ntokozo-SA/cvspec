import { useEffect, useRef, useState, type ReactElement } from 'react'
import { sendMessage } from '../../shared/messages'
import type {
  Application,
  CoverLetterFormat,
  CoverLetterLength,
  CoverLetterTone,
} from '../../shared/types'
import { downloadFile } from './download'

const MAX_LETTER = 8000

type Busy = 'draft' | 'save' | CoverLetterFormat | null

/** Draft, edit and download the cover letter for this job. Only the text is stored. */
export function CoverLetterSection({
  application,
  onApplicationChange,
}: {
  application: Application
  onApplicationChange: (next: Application) => void
}): ReactElement {
  const [text, setText] = useState(application.cover_letter ?? '')
  const [tone, setTone] = useState<CoverLetterTone>('professional')
  const [length, setLength] = useState<CoverLetterLength>('medium')
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const saved = useRef(application.cover_letter ?? '')
  const applicationRef = useRef(application)

  useEffect(() => {
    applicationRef.current = application
  }, [application])

  useEffect(() => {
    saved.current = applicationRef.current.cover_letter ?? ''
    setText(saved.current)
    setError(null)
  }, [application.id])

  const store = (coverLetter: string | null, updatedAt: string | null) => {
    saved.current = coverLetter ?? ''
    onApplicationChange({
      ...applicationRef.current,
      cover_letter: coverLetter,
      cover_letter_updated_at: updatedAt,
    })
  }

  const save = async () => {
    if (text.trim() === saved.current.trim()) return
    const result = await sendMessage({
      type: 'SAVE_COVER_LETTER',
      applicationId: applicationRef.current.id,
      coverLetter: text,
    })
    store(result.coverLetter, result.updatedAt)
  }

  const run = async (kind: NonNullable<Busy>, action: () => Promise<void>) => {
    setBusy(kind)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong with the cover letter')
    } finally {
      setBusy(null)
    }
  }

  const draft = () =>
    run('draft', async () => {
      if (text.trim() && !window.confirm('Replace your cover letter with a new draft?')) return
      const result = await sendMessage({
        type: 'DRAFT_COVER_LETTER',
        applicationId: applicationRef.current.id,
        tone,
        length,
      })
      setText(result.coverLetter ?? '')
      store(result.coverLetter, result.updatedAt)
    })

  const download = (format: CoverLetterFormat) =>
    run(format, async () => {
      await save()
      downloadFile(
        await sendMessage({
          type: 'GET_COVER_LETTER_FILE',
          applicationId: applicationRef.current.id,
          format,
        }),
      )
    })

  return (
    <section className="cvs-section cvs-letter">
      <h3>Cover letter</h3>
      <p className="cvs-muted cvs-section__hint">
        Drafted from your resume, the edits you ticked and this posting. Edit it here; CVSpec
        attaches or pastes it when you fill the application.
      </p>
      <div className="cvs-letter__controls">
        <label className="cvs-field">
          <span>Tone</span>
          <select
            value={tone}
            disabled={busy !== null}
            onChange={(event) => setTone(event.target.value as CoverLetterTone)}
          >
            <option value="professional">Professional</option>
            <option value="warm">Warm</option>
            <option value="concise">Concise</option>
          </select>
        </label>
        <label className="cvs-field">
          <span>Length</span>
          <select
            value={length}
            disabled={busy !== null}
            onChange={(event) => setLength(event.target.value as CoverLetterLength)}
          >
            <option value="short">Short</option>
            <option value="medium">Medium</option>
            <option value="long">Long</option>
          </select>
        </label>
        <button
          type="button"
          className="cvs-btn cvs-btn--secondary"
          disabled={busy !== null}
          onClick={() => void draft()}
        >
          {busy === 'draft' ? 'Drafting...' : text.trim() ? 'Draft again' : 'Draft'}
        </button>
      </div>
      <textarea
        className="cvs-input cvs-input--area cvs-letter__text"
        aria-label="Cover letter"
        placeholder="Draft a cover letter, or write your own."
        maxLength={MAX_LETTER}
        rows={10}
        value={text}
        disabled={busy === 'draft'}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => void run('save', save)}
      />
      {error && <div className="cvs-error">{error}</div>}
      <div className="cvs-letter__actions">
        <span className="cvs-muted">
          {busy === 'save' ? 'Saving...' : `${text.length} / ${MAX_LETTER}`}
        </span>
        <button
          type="button"
          className="cvs-link"
          disabled={busy !== null || !text.trim()}
          onClick={() => void download('docx')}
        >
          {busy === 'docx' ? 'Building...' : 'Download DOCX'}
        </button>
        <button
          type="button"
          className="cvs-link"
          disabled={busy !== null || !text.trim()}
          onClick={() => void download('pdf')}
        >
          {busy === 'pdf' ? 'Building...' : 'Download PDF'}
        </button>
      </div>
    </section>
  )
}
