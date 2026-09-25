import { useCallback, useRef, useState, type DragEvent, type ReactElement } from 'react'

interface FileDropProps {
  accept: string
  label: string
  hint: string
  disabled?: boolean
  onFile: (file: File) => void
}

export function FileDrop({
  accept,
  label,
  hint,
  disabled,
  onFile,
}: FileDropProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null)
  const [active, setActive] = useState(false)

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0]
      if (file) onFile(file)
    },
    [onFile],
  )

  const onDrop = (event: DragEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    setActive(false)
    if (disabled) return
    handleFiles(event.dataTransfer.files)
  }

  return (
    <>
      <button
        type="button"
        className={`dropzone${active ? ' is-active' : ''}`}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault()
          setActive(true)
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setActive(false)}
        onDrop={onDrop}
      >
        <div className="dropzone__title">{label}</div>
        <div className="dropzone__hint">{hint}</div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
    </>
  )
}
