import OpenAI from 'openai'

export type AiClient = Pick<OpenAI, 'chat'>

let override: AiClient | null = null

export function getClient(): AiClient {
  if (override) return override
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY is not configured')
  return new OpenAI({ apiKey: key })
}

/** Replaces the OpenAI client in tests. Pass null to restore the real one. */
export function setAiClientForTests(client: AiClient | null): void {
  override = client
}

export function aiModel(): string {
  return process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
}
