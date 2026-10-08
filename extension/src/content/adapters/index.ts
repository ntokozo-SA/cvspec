import { createGenericAdapter, genericBoardConfigs } from './generic'
import { glassdoorAdapter } from './glassdoor'
import { googleJobsAdapter } from './googleJobs'
import { indeedAdapter } from './indeed'
import { linkedinAdapter } from './linkedin'
import type { JobBoardAdapter } from './types'

export const adapters: JobBoardAdapter[] = [
  linkedinAdapter,
  indeedAdapter,
  glassdoorAdapter,
  googleJobsAdapter,
  ...genericBoardConfigs.map(createGenericAdapter),
]

export function findAdapter(url: URL): JobBoardAdapter | null {
  return adapters.find((adapter) => adapter.matches(url)) ?? null
}

export type { JobBoardAdapter }
