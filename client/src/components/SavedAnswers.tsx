import { useEffect, useState, type ReactElement } from 'react'
import { Button } from './Layout'
import {
  createSavedAnswer,
  deleteSavedAnswer,
  listSavedAnswers,
  updateSavedAnswer,
} from '../lib/api'
import type { AnswerCategory, SavedAnswer, SavedAnswerInput } from '../types'

const CATEGORY_LABELS: Record<AnswerCategory, string> = {
  salary: 'Salary',
  notice_period: 'Notice period',
  start_date: 'Start date',
  relocation: 'Relocation',
  work_authorization: 'Work permit',
  motivation: 'Motivation',
  referral_source: 'How you heard about the job',
  other: 'Other',
}

const PRESETS: Array<SavedAnswerInput & { placeholder: string }> = [
  {
    category: 'salary',
    question: 'Salary expectation',
    answer: '',
    placeholder: 'R45 000 per month CTC, negotiable',
  },
  { category: 'notice_period', question: 'Notice period', answer: '', placeholder: '1 month' },
  {
    category: 'start_date',
    question: 'Earliest start date',
    answer: '',
    placeholder: '1 month after accepting an offer',
  },
  {
    category: 'relocation',
    question: 'Are you willing to relocate?',
    answer: '',
    placeholder: 'Yes, within Gauteng or the Western Cape',
  },
  {
    category: 'work_authorization',
    question: 'Do you have the right to work in South Africa?',
    answer: '',
    placeholder: 'Yes, South African citizen',
  },
]

interface RowProps {
  initial: SavedAnswerInput
  saved: SavedAnswer | null
  preset: boolean
  placeholder?: string
  disabled: boolean
  onSaved: (answer: SavedAnswer) => void
  onDeleted: (id: string) => void
  onError: (message: string | null) => void
}

function AnswerRow({
  initial,
  saved,
  preset,
  placeholder,
  disabled,
  onSaved,
  onDeleted,
  onError,
}: RowProps): ReactElement {
  const [draft, setDraft] = useState<SavedAnswerInput>(initial)
  const [busy, setBusy] = useState(false)
  const changed =
    draft.answer.trim() !== (saved?.answer ?? '') ||
    draft.question.trim() !== (saved?.question ?? initial.question) ||
    draft.category !== (saved?.category ?? initial.category)

  const save = async (): Promise<void> => {
    setBusy(true)
    onError(null)
    try {
      const result = saved
        ? await updateSavedAnswer(saved.id, draft)
        : await createSavedAnswer(draft)
      onSaved(result)
      if (!saved && !preset) setDraft(initial)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not save the answer')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (!saved) return
    setBusy(true)
    onError(null)
    try {
      await deleteSavedAnswer(saved.id)
      onDeleted(saved.id)
      setDraft(initial)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not delete the answer')
    } finally {
      setBusy(false)
    }
  }

  const id = saved?.id ?? `${initial.category}-${preset ? 'preset' : 'new'}`
  return (
    <div className="saved-answer">
      {preset ? (
        <label htmlFor={`answer-${id}`} className="saved-answer__question">
          {draft.question}
        </label>
      ) : (
        <div className="saved-answer__head">
          <input
            className="input"
            aria-label="Question"
            placeholder="Question, as forms usually ask it"
            value={draft.question}
            disabled={disabled || busy}
            onChange={(e) => setDraft({ ...draft, question: e.target.value })}
          />
          <select
            className="select"
            aria-label="Category"
            value={draft.category}
            disabled={disabled || busy}
            onChange={(e) => setDraft({ ...draft, category: e.target.value as AnswerCategory })}
          >
            {(Object.keys(CATEGORY_LABELS) as AnswerCategory[]).map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </div>
      )}
      <textarea
        id={`answer-${id}`}
        className="textarea"
        rows={2}
        maxLength={4000}
        placeholder={placeholder ?? 'Your answer'}
        value={draft.answer}
        disabled={disabled || busy}
        onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
      />
      <div className="saved-answer__actions">
        {saved && (
          <Button variant="ghost" size="sm" disabled={disabled || busy} onClick={() => void remove()}>
            Delete
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || busy || !changed || !draft.answer.trim() || !draft.question.trim()}
          onClick={() => void save()}
        >
          {busy ? 'Saving...' : saved ? 'Update' : 'Save'}
        </Button>
      </div>
    </div>
  )
}

export function SavedAnswers({ disabled }: { disabled: boolean }): ReactElement {
  const [answers, setAnswers] = useState<SavedAnswer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    listSavedAnswers()
      .then((list) => {
        if (alive) setAnswers(list)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load saved answers')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const onSaved = (answer: SavedAnswer) =>
    setAnswers((prev) => [answer, ...prev.filter((item) => item.id !== answer.id)])
  const onDeleted = (id: string) => setAnswers((prev) => prev.filter((item) => item.id !== id))

  const presetFor = (preset: SavedAnswerInput) =>
    answers.find((item) => item.category === preset.category && item.question === preset.question) ??
    null
  const presetIds = new Set(
    PRESETS.map(presetFor)
      .filter((item): item is SavedAnswer => item !== null)
      .map((item) => item.id),
  )
  const custom = answers.filter((item) => !presetIds.has(item.id))

  return (
    <section className="panel panel-pad form-stack saved-answers">
      <div>
        <h2>Saved answers</h2>
        <p className="field-hint">
          The extension uses these to answer common application questions, and drafts the rest
          from your resume and the job for you to edit. CVSpec never stores ID numbers or answers
          to employment-equity, disability, health or criminal-record questions: the extension
          leaves those fields for you and outlines them in purple.
        </p>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <div className="loading-block">Loading saved answers...</div>
      ) : (
        <>
          {PRESETS.map((preset) => {
            const saved = presetFor(preset)
            return (
              <AnswerRow
                key={`${preset.category}-${saved?.id ?? 'new'}`}
                initial={saved ? { ...preset, answer: saved.answer } : preset}
                saved={saved}
                preset
                placeholder={preset.placeholder}
                disabled={disabled}
                onSaved={onSaved}
                onDeleted={onDeleted}
                onError={setError}
              />
            )
          })}

          {custom.map((saved) => (
            <AnswerRow
              key={saved.id}
              initial={{ category: saved.category, question: saved.question, answer: saved.answer }}
              saved={saved}
              preset={false}
              disabled={disabled}
              onSaved={onSaved}
              onDeleted={onDeleted}
              onError={setError}
            />
          ))}

          <h3 className="saved-answers__add">Add another answer</h3>
          <AnswerRow
            initial={{ category: 'other', question: '', answer: '' }}
            saved={null}
            preset={false}
            disabled={disabled}
            onSaved={onSaved}
            onDeleted={onDeleted}
            onError={setError}
          />
        </>
      )}
    </section>
  )
}
