import { genericFormAdapter } from './generic'
import { greenhouseAdapter } from './greenhouse'
import { leverAdapter } from './lever'
import type { ApplyFormAdapter } from './types'

const adapters: ApplyFormAdapter[] = [greenhouseAdapter, leverAdapter]

/** The hiring-system adapter for this page, falling back to generic field matching. */
export function findApplyFormAdapter(url: URL): ApplyFormAdapter {
  return adapters.find((adapter) => adapter.matches(url)) ?? genericFormAdapter
}

export type { ApplyFormAdapter }
