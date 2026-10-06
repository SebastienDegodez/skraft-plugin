import { Ok, Err } from '../result.mjs'

// Pure: a working copy runs one pipeline at a time, the one its `.active-slug` names
// (ActivePipeline). Several worktrees each have their own tracking directory and so their
// own pointer: whatever acts on "the pipeline" — the canvas, answering a checkpoint,
// closing a phase — acts on that one, and never guesses another (from the branch, from
// the only pipeline on disk). No pointer, nothing to act on: start a run first, it
// records the pointer.
//
//   requested  the slug the caller named, or null
//   active     the slug .active-slug records, or null (absent, unreadable, malformed)

export const NO_ACTIVE_PIPELINE = 'NO_ACTIVE_PIPELINE'
export const NOT_THE_ACTIVE_PIPELINE = 'NOT_THE_ACTIVE_PIPELINE'

export const resolveActivePipeline = ({ requested = null, active = null }) => {
  if (!active) {
    return Err({
      code: NO_ACTIVE_PIPELINE,
      reason: 'No SKRAFT pipeline is active in this working copy (no .active-slug): start one with the skraft-pipeline workflow or /skraft <slug>, it records the pointer.',
    })
  }
  if (requested && requested !== active) {
    return Err({
      code: NOT_THE_ACTIVE_PIPELINE,
      reason: `"${requested}" is not the pipeline of this working copy: .active-slug names "${active}". Open the worktree that runs "${requested}", or start it here.`,
    })
  }
  return Ok(active)
}
