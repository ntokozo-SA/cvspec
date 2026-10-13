import { genericFormAdapter } from './generic'
import { greenhouseAdapter } from './greenhouse'
import { leverAdapter } from './lever'
import { smartRecruitersAdapter } from './smartrecruiters'
import { successFactorsAdapter } from './successfactors'
import type { ApplyFormAdapter } from './types'
import { workableAdapter } from './workable'
import { workdayAdapter } from './workday'

const adapters: ApplyFormAdapter[] = [
  greenhouseAdapter,
  leverAdapter,
  smartRecruitersAdapter,
  workdayAdapter,
  successFactorsAdapter,
  workableAdapter,
]

/** Every adapter, generic last. */
export const allApplyFormAdapters: readonly ApplyFormAdapter[] = [...adapters, genericFormAdapter]

/** The hiring-system adapter for this page, falling back to generic field matching. */
export function findApplyFormAdapter(url: URL): ApplyFormAdapter {
  return adapters.find((adapter) => adapter.matches(url)) ?? genericFormAdapter
}

export type { ApplyFormAdapter }
