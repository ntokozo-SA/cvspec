/** The application columns `prepareApplication` reads. */
export interface PrepareRow {
  resume_id: string | null
  comparison_id: string | null
  tailored_comparison_id: string | null
  tailored_recommendations: number[] | null
  cover_letter: string | null
}

export interface PrepareOptions {
  /** Draft a cover letter when the job has none. */
  coverLetter: boolean
}

/** What this call did; all false when the job was already prepared. */
export interface PrepareSteps {
  analyzed: boolean
  tailored: boolean
  coverLetter: boolean
}

export interface PrepareDeps {
  findResumeId(): Promise<string | null>
  /** Scores the resume against the job and links the comparison to the application. */
  analyze(resumeId: string): Promise<{ id: string; recommendationCount: number }>
  recommendationCount(comparisonId: string): Promise<number>
  /** Drafts a cover letter from the application as stored (including tailoring). */
  draftCoverLetter(): Promise<string>
  update(patch: Record<string, unknown>): Promise<void>
  /** Spends one AI call; returns false when the user is over the hourly budget. */
  spendAi(): boolean
}

export class PrepareError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/**
 * Gets a queued job ready to apply: scores it if it has no score, chooses every recommendation
 * if no tailoring was chosen, and drafts a cover letter if asked and none exists. Each step is
 * skipped when already done, so calling it again changes nothing.
 */
export async function prepareApplication(
  row: PrepareRow,
  options: PrepareOptions,
  deps: PrepareDeps,
): Promise<PrepareSteps> {
  const steps: PrepareSteps = { analyzed: false, tailored: false, coverLetter: false }

  let comparisonId = row.comparison_id
  let count: number | null = null
  if (!comparisonId) {
    const resumeId = row.resume_id ?? (await deps.findResumeId())
    if (!resumeId) throw new PrepareError(400, 'Upload a resume in CVSpec before preparing jobs')
    if (!deps.spendAi()) throw new PrepareError(429, 'AI limit reached')
    const comparison = await deps.analyze(resumeId)
    comparisonId = comparison.id
    count = comparison.recommendationCount
    steps.analyzed = true
  }

  if (!row.tailored_comparison_id || !row.tailored_recommendations?.length) {
    count ??= await deps.recommendationCount(comparisonId)
    if (count > 0) {
      await deps.update({
        tailored_comparison_id: comparisonId,
        tailored_recommendations: Array.from({ length: count }, (_, index) => index),
      })
      steps.tailored = true
    }
  }

  if (options.coverLetter && !row.cover_letter?.trim()) {
    if (!deps.spendAi()) throw new PrepareError(429, 'AI limit reached')
    const text = await deps.draftCoverLetter()
    await deps.update({ cover_letter: text, cover_letter_updated_at: new Date().toISOString() })
    steps.coverLetter = true
  }

  return steps
}
