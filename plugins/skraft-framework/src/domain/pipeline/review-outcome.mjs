import { parseReviewVerdict } from '../artifact-policy.mjs'

// Pure: what a review file says, read the way the phase gate reads it (artifact-policy).
// The verdict is the file's, never the reviewer's chat answer: the disk is the evidence.
const ENVIRONMENT_RE = /^escalation:\s*"?environment"?\s*$/m
const MAX_FINDINGS_CHARS = 20_000

export const readReviewOutcome = (content) => {
  if (typeof content !== 'string') return Object.freeze({ verdict: null, escalation: null, findings: '' })
  return Object.freeze({
    verdict: parseReviewVerdict(content),
    escalation: ENVIRONMENT_RE.test(content) ? 'environment' : null,
    findings: content.length > MAX_FINDINGS_CHARS ? `${content.slice(0, MAX_FINDINGS_CHARS)}\n…(truncated)` : content,
  })
}
