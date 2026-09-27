import { glassdoorAdapter } from './glassdoor'
import { indeedAdapter } from './indeed'
import { linkedinAdapter } from './linkedin'
import type { JobBoardAdapter } from './types'

export const adapters: JobBoardAdapter[] = [linkedinAdapter, indeedAdapter, glassdoorAdapter]

export function findAdapter(url: URL): JobBoardAdapter | null {
  return adapters.find((adapter) => adapter.matches(url)) ?? null
}

export type { JobBoardAdapter }
