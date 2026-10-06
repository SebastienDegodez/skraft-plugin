// Shared by the pipeline use cases: how a run stops, and how it asks the human.
//
// A Halt carries the outcome a use case returns: blocked (a refusal or a human "stop") or
// awaiting-human (a checkpoint nobody could answer now). A checkpoint answer is read from
// the DecisionStore first, so a recorded answer — given in the dialog, through the decide
// /skraft decide or the skraft_decide tool — resumes the run without asking again.

export class Halt extends Error {
  constructor(outcome) {
    super(outcome.reason)
    this.outcome = outcome
  }
}

export const blocked = (phase, reason, detail) => new Halt({ status: 'blocked', phase, reason, ...(detail ? { detail } : {}) })
export const awaiting = (phase, checkpoint) => new Halt({ status: 'awaiting-human', phase, reason: checkpoint.question, checkpoint })

// ask(slug, phase, { key, question, options }) => Promise<string>, or throws awaiting.
export const createCheckpoint = ({ decisionStore, humanInteraction }) => Object.freeze({
  ask: async (slug, phase, checkpoint) => {
    const recorded = await decisionStore.read(slug, checkpoint.key)
    if (recorded) return recorded
    const answer = await humanInteraction.ask(checkpoint)
    if (answer === null || answer === undefined || String(answer).trim() === '') throw awaiting(phase, checkpoint)
    await decisionStore.write(slug, checkpoint.key, String(answer).trim(), 'human')
    return String(answer).trim()
  },
})
