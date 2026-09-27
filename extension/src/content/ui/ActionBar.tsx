import type { ReactElement } from 'react'

export type SaveState = 'idle' | 'syncing' | 'saved' | 'error'

function CheckIcon(): ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const SAVE_LABELS: Record<SaveState, string> = {
  idle: 'Save to CVSpec',
  syncing: 'Syncing...',
  saved: 'Saved to CVSpec',
  error: 'Save to CVSpec',
}

export function ActionBar({
  saveState,
  notice,
  onSave,
  onTailor,
  onDismissNotice,
}: {
  saveState: SaveState
  notice: string | null
  onSave: () => void
  onTailor: () => void
  onDismissNotice: () => void
}): ReactElement {
  return (
    <div className="cvs-bar">
      <div className="cvs-bar__buttons">
        <button
          type="button"
          className={`cvs-btn cvs-btn--secondary${saveState === 'saved' ? ' is-saved' : ''}`}
          onClick={onSave}
          disabled={saveState === 'syncing'}
          title={saveState === 'saved' ? 'Open your applications in CVSpec' : undefined}
        >
          {saveState === 'saved' && <CheckIcon />}
          {SAVE_LABELS[saveState]}
        </button>
        <button
          type="button"
          className="cvs-btn cvs-btn--primary"
          onClick={onTailor}
          disabled={saveState === 'syncing'}
        >
          Tailor before applying
        </button>
      </div>
      {notice && (
        <div className="cvs-bar__notice" role="status">
          <span>{notice}</span>
          <button type="button" className="cvs-link" onClick={onDismissNotice}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
