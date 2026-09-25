import { useCallback, useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { Button, EmptyState } from '../components/Layout'
import { FileDrop } from '../components/FileDrop'
import { createJobSpec, deleteJobSpec, listJobSpecs } from '../lib/api'
import { useOnline } from '../hooks/useOnline'
import type { JobSpec, SourceType } from '../types'

export function JobSpecsPage(): ReactElement {
  const online = useOnline()
  const [tab, setTab] = useState<SourceType>('text')
  const [jobs, setJobs] = useState<JobSpec[]>([])
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setJobs(await listJobSpecs())
  }, [])

  useEffect(() => {
    let alive = true
    refresh()
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load job specs')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [refresh])

  const submitText = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await createJobSpec({ sourceType: 'text', text })
      setText('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save job spec')
    } finally {
      setBusy(false)
    }
  }

  const submitLink = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await createJobSpec({ sourceType: 'link', url })
      setUrl('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not fetch job link')
    } finally {
      setBusy(false)
    }
  }

  const submitFile = async (file: File): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await createJobSpec({ sourceType: 'document', file })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse document')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Job specs</h1>
          <p>Paste a posting, upload a document, or try a public job link.</p>
        </div>
      </div>

      {error && <div className="form-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      <div className="panel panel-pad" style={{ marginBottom: '1rem' }}>
        <div className="tabs" role="tablist">
          {(['text', 'document', 'link'] as SourceType[]).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              className={`tab${tab === item ? ' is-active' : ''}`}
              aria-selected={tab === item}
              onClick={() => setTab(item)}
            >
              {item === 'text' ? 'Pasted text' : item === 'document' ? 'Document' : 'Link'}
            </button>
          ))}
        </div>

        {tab === 'text' && (
          <form className="form-stack" onSubmit={(e) => void submitText(e)}>
            <div className="field">
              <label htmlFor="job-text">Job posting text</label>
              <textarea
                id="job-text"
                className="textarea"
                required
                disabled={!online || busy}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste the full job description here"
              />
            </div>
            <Button type="submit" disabled={!online || busy || text.trim().length < 40}>
              {busy ? 'Extracting requirements...' : 'Parse job text'}
            </Button>
          </form>
        )}

        {tab === 'link' && (
          <form className="form-stack" onSubmit={(e) => void submitLink(e)}>
            <div className="field">
              <label htmlFor="job-url">Job posting URL</label>
              <input
                id="job-url"
                className="input"
                type="url"
                required
                disabled={!online || busy}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://"
              />
              <span className="field-hint">
                Some sites block scrapers. If extraction fails, paste the text instead.
              </span>
            </div>
            <Button type="submit" disabled={!online || busy}>
              {busy ? 'Fetching posting...' : 'Fetch and parse link'}
            </Button>
          </form>
        )}

        {tab === 'document' && (
          <FileDrop
            accept=".pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            label={busy ? 'Parsing document...' : 'Drop a job-spec PDF or DOCX'}
            hint="Use this when the posting is a downloadable file."
            disabled={!online || busy}
            onFile={(file) => void submitFile(file)}
          />
        )}
      </div>

      {loading ? (
        <div className="loading-block">Loading job specs...</div>
      ) : jobs.length === 0 ? (
        <EmptyState
          title="No job specs yet"
          text="Add the posting you are targeting before you compare."
        />
      ) : (
        <div className="stack">
          {jobs.map((job) => (
            <div key={job.id} className="list-row">
              <div className="list-row__meta">
                <div className="list-row__title">
                  {job.parsed_json?.title ?? job.title ?? `${job.source_type} job spec`}
                </div>
                <div className="list-row__sub">
                  {job.source_type} ·{' '}
                  {job.parsed_json
                    ? `${job.parsed_json.requiredSkills.length} required skills`
                    : 'Unparsed'}{' '}
                  · {new Date(job.created_at).toLocaleString()}
                </div>
              </div>
              <Button
                variant="danger"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void deleteJobSpec(job.id)
                    .then(refresh)
                    .catch((err: unknown) =>
                      setError(err instanceof Error ? err.message : 'Delete failed'),
                    )
                }
              >
                Delete
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
