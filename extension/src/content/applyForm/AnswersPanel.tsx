import { useEffect, useState, type ReactElement } from 'react'
import { WEB_URL } from '../../shared/config'
import { sendMessage } from '../../shared/messages'
import type { AnswerSource, ApplicationAnswer, DraftedAnswer, SavedAnswer } from '../../shared/types'
import type { ApplyFormAdapter, CustomQuestion } from './adapters/types'
import { fillAnswers, type AnswerFillResult } from './fill'
import { chosenOptions, isAnswered, matchBank, toPayload } from './questions'

type RowSource = AnswerSource | 'needs'

export interface AnswerRow {
  question: CustomQuestion
  answer: string
  source: RowSource
  edited: boolean
  savedToBank: boolean
}

const SOURCE_LABELS: Record<RowSource, string> = {
  bank: 'From your answers',
  ai: 'AI draft',
  user: 'Your answer',
  needs: 'Needs you',
}

/**
 * Starting answers for each question: what the candidate kept for this job, else a saved answer,
 * else null (to be drafted).
 */
export function initialRows(
  questions: CustomQuestion[],
  stored: ApplicationAnswer[],
  bank: SavedAnswer[],
): Array<AnswerRow & { pending: boolean }> {
  const byKey = new Map(stored.map((answer) => [answer.questionKey, answer]))
  return questions.map((question) => {
    const kept = byKey.get(question.key)
    if (kept) {
      return {
        question,
        answer: kept.answer,
        source: kept.source,
        edited: false,
        savedToBank: false,
        pending: false,
      }
    }
    const fromBank = matchBank(question, bank)
    return {
      question,
      answer: fromBank ?? '',
      source: fromBank ? 'bank' : 'needs',
      edited: false,
      savedToBank: false,
      pending: fromBank === null,
    }
  })
}

export function applyDrafts(rows: AnswerRow[], drafts: DraftedAnswer[]): AnswerRow[] {
  const byKey = new Map(drafts.map((draft) => [draft.key, draft]))
  return rows.map((row) => {
    const draft = byKey.get(row.question.key)
    if (!draft || row.answer) return row
    return {
      ...row,
      answer: draft.answer,
      source: draft.needsUserInput || !draft.answer ? 'needs' : draft.source,
    }
  })
}

function Editor({
  row,
  disabled,
  onChange,
}: {
  row: AnswerRow
  disabled: boolean
  onChange: (value: string) => void
}): ReactElement {
  const { question } = row
  const id = `cvs-answer-${question.key}`
  if (question.kind === 'text') {
    return (
      <input
        id={id}
        className="cvs-input"
        value={row.answer}
        maxLength={question.maxLength ?? undefined}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }
  if (question.kind === 'textarea') {
    return (
      <textarea
        id={id}
        className="cvs-input cvs-input--area"
        rows={4}
        value={row.answer}
        maxLength={question.maxLength ?? undefined}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }
  if (question.kind === 'checkbox' && question.options.length > 0) {
    const chosen = new Set(chosenOptions(question, row.answer))
    return (
      <div className="cvs-answer__options" role="group" aria-labelledby={`${id}-label`}>
        {question.options.map((option) => (
          <label key={option} className="cvs-answer__option">
            <input
              type="checkbox"
              checked={chosen.has(option)}
              disabled={disabled}
              onChange={(event) => {
                const next = new Set(chosen)
                if (event.target.checked) next.add(option)
                else next.delete(option)
                onChange(question.options.filter((item) => next.has(item)).join('; '))
              }}
            />
            {option}
          </label>
        ))}
      </div>
    )
  }
  const options = question.options.length > 0 ? question.options : ['Yes', 'No']
  const [value = ''] = chosenOptions(question, row.answer)
  return (
    <select
      id={id}
      className="cvs-input"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Choose...</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  )
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'ready'; drafting: boolean }
  | { kind: 'filling' }
  | { kind: 'done'; result: AnswerFillResult }

export function AnswersPanel({
  adapter,
  applicationId,
  onFilled,
}: {
  adapter: ApplyFormAdapter
  applicationId: string
  onFilled: (result: AnswerFillResult) => void
}): ReactElement | null {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [rows, setRows] = useState<AnswerRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const open = adapter
        .questions()
        .filter((question) => !question.sensitive && !isAnswered(question))
      if (open.length === 0) {
        setPhase({ kind: 'empty' })
        return
      }
      try {
        const [stored, bank] = await Promise.all([
          sendMessage({ type: 'GET_ANSWERS', applicationId }),
          sendMessage({ type: 'LIST_BANK' }),
        ])
        if (!alive) return
        const start = initialRows(open, stored, bank)
        const pending = start.filter((row) => row.pending).map((row) => row.question)
        setRows(start)
        setPhase({ kind: 'ready', drafting: pending.length > 0 })
        if (pending.length === 0) return

        try {
          const drafts = await sendMessage({
            type: 'DRAFT_ANSWERS',
            applicationId,
            questions: pending.map(toPayload),
          })
          if (alive) setRows((current) => applyDrafts(current, drafts))
        } catch (err) {
          if (alive) {
            setError(
              err instanceof Error
                ? `Couldn't draft answers: ${err.message}`
                : "Couldn't draft answers",
            )
          }
        } finally {
          if (alive) setPhase({ kind: 'ready', drafting: false })
        }
      } catch (err) {
        if (!alive) return
        setError(err instanceof Error ? err.message : 'Could not load your answers')
        setRows(initialRows(open, [], []))
        setPhase({ kind: 'ready', drafting: false })
      }
    })()
    return () => {
      alive = false
    }
  }, [adapter, applicationId])

  const update = (key: string, answer: string) =>
    setRows((current) =>
      current.map((row) =>
        row.question.key === key
          ? { ...row, answer, edited: true, source: 'user', savedToBank: false }
          : row,
      ),
    )

  const saveToBank = async (row: AnswerRow) => {
    setError(null)
    try {
      await sendMessage({
        type: 'SAVE_BANK_ANSWER',
        answer: { category: row.question.category, question: row.question.label, answer: row.answer },
      })
      setRows((current) =>
        current.map((item) =>
          item.question.key === row.question.key ? { ...item, savedToBank: true } : item,
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the answer')
    }
  }

  const fill = async () => {
    setError(null)
    setPhase({ kind: 'filling' })
    const answered = rows.filter((row) => row.answer.trim())
    try {
      await sendMessage({
        type: 'SAVE_ANSWERS',
        applicationId,
        answers: answered.map((row) => ({
          questionKey: row.question.key,
          questionLabel: row.question.label,
          answer: row.answer.trim(),
          source: row.source === 'needs' ? 'user' : row.source,
        })),
      })
    } catch (err) {
      setError(
        err instanceof Error
          ? `Filled, but couldn't save the answers for next time: ${err.message}`
          : "Filled, but couldn't save the answers for next time",
      )
    }
    const result = await fillAnswers(
      rows.map((row) => row.question),
      new Map(answered.map((row) => [row.question.key, row.answer])),
    )
    setPhase({ kind: 'done', result })
    onFilled(result)
  }

  if (phase.kind === 'loading' || phase.kind === 'empty') return null

  const busy = phase.kind === 'filling'
  return (
    <section className="cvs-answers" aria-label="Answers to this form's questions">
      <div className="cvs-answers__head">
        <strong>
          {rows.length} question{rows.length === 1 ? '' : 's'} on this form
        </strong>
        <p className="cvs-muted">
          Check and edit each answer. CVSpec fills them in; you review and submit.
        </p>
      </div>

      {error && <div className="cvs-error">{error}</div>}

      {phase.kind === 'done' ? (
        <p className="cvs-muted">
          Filled {phase.result.answered.length} answer
          {phase.result.answered.length === 1 ? '' : 's'}.
          {phase.result.kept.length > 0 &&
            ` Kept ${phase.result.kept.length} the form already had.`}
          {phase.result.unmatched.length > 0 &&
            ` ${phase.result.unmatched.length} didn't match the form's options; choose those yourself.`}
        </p>
      ) : (
        <>
          {phase.kind === 'ready' && phase.drafting && (
            <div className="cvs-loading cvs-fill__loading">
              <span className="cvs-spinner" aria-hidden />
              Drafting answers from your resume and the job...
            </div>
          )}
          <ol className="cvs-answers__list">
            {rows.map((row) => (
              <li key={row.question.key} className="cvs-answer">
                <div className="cvs-answer__top">
                  <label
                    id={`cvs-answer-${row.question.key}-label`}
                    htmlFor={`cvs-answer-${row.question.key}`}
                    className="cvs-answer__label"
                  >
                    {row.question.label}
                    {row.question.required && <span aria-hidden> *</span>}
                  </label>
                  <span className={`cvs-answer__badge cvs-answer__badge--${row.source}`}>
                    {SOURCE_LABELS[row.source]}
                  </span>
                </div>
                <Editor
                  row={row}
                  disabled={busy}
                  onChange={(value) => update(row.question.key, value)}
                />
                <button
                  type="button"
                  className="cvs-link cvs-answer__save"
                  disabled={busy || !row.answer.trim() || row.savedToBank}
                  onClick={() => void saveToBank(row)}
                >
                  {row.savedToBank ? 'Saved to your answers' : 'Save to my answers'}
                </button>
              </li>
            ))}
          </ol>
          <div className="cvs-fill__actions">
            <a
              className="cvs-link"
              href={`${WEB_URL}/app/profile`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Manage saved answers
            </a>
            <button
              type="button"
              className="cvs-btn cvs-btn--primary"
              disabled={busy || !rows.some((row) => row.answer.trim())}
              onClick={() => void fill()}
            >
              {busy ? 'Filling...' : 'Fill these answers'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
