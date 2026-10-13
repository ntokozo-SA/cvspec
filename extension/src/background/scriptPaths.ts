import applyFormScript from '../content/applyForm/index.tsx?script'
import jobBoardScript from '../content/jobBoard.tsx?script'

/** Built content script files, for runtime registration on optional sites. */
export const SCRIPT_PATHS = {
  board: jobBoardScript,
  apply: applyFormScript,
} as const
