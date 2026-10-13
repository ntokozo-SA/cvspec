import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { Button } from './Layout'
import { saveBlob } from '../lib/download'

export interface PreviewFile {
  blob: Blob
  fileName: string
}

type PreviewKind = 'pdf' | 'docx' | 'unsupported'

function kindOf(file: PreviewFile): PreviewKind {
  if (file.blob.type === 'application/pdf' || /\.pdf$/i.test(file.fileName)) return 'pdf'
  if (/\.docx$/i.test(file.fileName)) return 'docx'
  return 'unsupported'
}

export function ResumePreview({
  file,
  note,
  onClose,
}: {
  file: PreviewFile
  note?: ReactNode
  onClose: () => void
}): ReactElement {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const docxRef = useRef<HTMLDivElement>(null)
  const kind = kindOf(file)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [docxStatus, setDocxStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  useEffect(() => {
    if (kind !== 'pdf') return
    const url = URL.createObjectURL(new Blob([file.blob], { type: 'application/pdf' }))
    setPdfUrl(url)
    return () => {
      URL.revokeObjectURL(url)
      setPdfUrl(null)
    }
  }, [file, kind])

  useEffect(() => {
    const container = docxRef.current
    if (kind !== 'docx' || !container) return
    let alive = true
    // Render off-DOM so a superseded render can never land in the container.
    const target = document.createElement('div')
    setDocxStatus('loading')
    import('docx-preview')
      .then(({ renderAsync }) =>
        renderAsync(file.blob, target, undefined, {
          className: 'docx',
          inWrapper: true,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
        }),
      )
      .then(() => {
        if (!alive) return
        container.replaceChildren(target)
        setDocxStatus('ready')
      })
      .catch(() => {
        if (alive) setDocxStatus('error')
      })
    return () => {
      alive = false
      container.replaceChildren()
    }
  }, [file, kind])

  return (
    <dialog
      ref={dialogRef}
      className="preview-dialog"
      aria-label={`Preview of ${file.fileName}`}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
    >
      <div className="preview-dialog__head">
        <h2 className="preview-dialog__title">{file.fileName}</h2>
        <div className="preview-dialog__actions">
          {pdfUrl && (
            <a className="btn btn-ghost btn-sm" href={pdfUrl} target="_blank" rel="noreferrer">
              Open in new tab
            </a>
          )}
          <Button variant="secondary" size="sm" onClick={() => saveBlob(file.blob, file.fileName)}>
            Download
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
      {note && <div className="preview-dialog__note">{note}</div>}
      <div className="preview-dialog__body">
        {kind === 'pdf' && pdfUrl && (
          <iframe className="preview-dialog__frame" src={pdfUrl} title={file.fileName} />
        )}
        {kind === 'docx' && (
          <>
            {docxStatus === 'loading' && <div className="loading-block">Rendering preview...</div>}
            {docxStatus === 'error' && (
              <div className="loading-block">
                This document could not be previewed. Download it to open it instead.
              </div>
            )}
            <div ref={docxRef} className="preview-dialog__docx" />
          </>
        )}
        {kind === 'unsupported' && (
          <div className="loading-block">
            Previews are only available for PDF and DOCX files. Download this file to open it.
          </div>
        )}
      </div>
    </dialog>
  )
}
