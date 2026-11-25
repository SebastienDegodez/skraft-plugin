// A delivery run reads an architecture already merged: it has no architecture checkpoint and no
// architecture pass. The shared pipeline asks this module, which skraft-design writes otherwise.

/** What a checkpoint gives when it settled a question itself: the run takes its next step again. */
export const AGAIN = Object.freeze({ again: true })

/** No checkpoint stops a delivery run: null for every step. */
export const architectureCheckpoint = async () => null

/** A delivery workflow has no architecture pass to complete: its node, were one ejected, goes on. */
export const completeArchitecturePass = async () => ({ answered: { answer: 'CONTINUE', reason: 'a delivery run has no architecture pass' } })
