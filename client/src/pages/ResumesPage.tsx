import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { Button, EmptyState } from '../components/Layout'
import { FileDrop } from '../components/FileDrop'
import { deleteResume, listResumes, uploadResume } from '../lib/api'
import { useOnline } from '../hooks/useOnline'
import type { Resume } from '../types'

export function ResumesPage(): ReactElement {
  const online = useOnline()
  const [resumes, setResumes] = useState<Resume[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const data = await listResumes()
    setResumes(data)
  }, [])

  useEffect(() => {
    let alive = true
    refresh()
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load resumes')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [refresh])

  const onFile = async (file: File): Promise<void> => {
    setError(null)
    setBusy(true)
    try {
      await uploadResume(file)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async (id: string): Promise<void> => {
    setBusy(true)
    try {
      await deleteResume(id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Resumes</h1>
          <p>Upload PDF or DOCX files. Parsed skills and experience are stored for comparisons.</p>
        </div>
      </div>

      {error && (
        <div className="form-error" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <div className="panel panel-pad" style={{ marginBottom: '1rem' }}>
        <FileDrop
          accept=".pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          label={busy ? 'Uploading and parsing...' : 'Add a resume'}
          hint="Drop a PDF or DOCX, or click to browse."
          disabled={!online || busy}
          onFile={(file) => void onFile(file)}
        />
        {!online && (
          <p className="field-hint" style={{ marginTop: '0.75rem' }}>
            Uploads are disabled while offline.
          </p>
        )}
      </div>

      {loading ? (
        <div className="loading-block">Loading resumes...</div>
      ) : resumes.length === 0 ? (
        <EmptyState
          title="No resumes uploaded"
          text="Add at least one resume before you run a comparison."
        />
      ) : (
        <div className="stack">
          {resumes.map((resume) => (
            <div key={resume.id} className="list-row">
              <div className="list-row__meta">
                <div className="list-row__title">{resume.file_name}</div>
                <div className="list-row__sub">
                  {resume.parsed_json
                    ? `${resume.parsed_json.skills.length} skills parsed`
                    : 'Awaiting parse'}{' '}
                  · {new Date(resume.created_at).toLocaleString()}
                </div>
              </div>
              <Button
                variant="danger"
                size="sm"
                disabled={busy}
                onClick={() => void onDelete(resume.id)}
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
