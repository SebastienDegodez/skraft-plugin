import { Ok, Err } from '../../domain/result.mjs'

// Use case RecordDecision (ports/api/record-decision.mjs): the human answers a pipeline
// checkpoint outside the run that asked — from /skraft decide (Claude Code mod) or the
// Copilot skraft_decide tool. The next run, or the resumed Copilot run, reads it
// through the DecisionStore port instead of asking again.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const createRecordDecision = ({ decisionStore }) => Object.freeze({
  record: async ({ slug, key, answer, by = 'human' }) => {
    if (!SLUG.test(slug ?? '')) return Err({ code: 'INVALID_SLUG', reason: `slug must be kebab-case, got ${JSON.stringify(slug)}` })
    if (typeof key !== 'string' || key.trim() === '') return Err({ code: 'INVALID_KEY', reason: 'a checkpoint key is required' })
    if (typeof answer !== 'string' || answer.trim() === '') return Err({ code: 'INVALID_ANSWER', reason: 'an answer is required' })
    await decisionStore.write(slug, key.trim(), answer.trim(), by)
    return Ok({ key: key.trim() })
  },
})
