import { isErr } from '../domain/result.mjs'
import { validateState } from '../domain/state-schema.mjs'
import { evaluateDispatch } from '../domain/pipeline-policy.mjs'
import { allow, deny, block } from '../adapters/api/hooks/decision.mjs'

// Pre-tool-use dispatch gate (Contract 3). Wires read -> validate -> evaluate -> audit -> map.
// Deny-by-default (ADR-004): every path produces a fact; any throw fails closed to block.

const allowFact = (decision) => ({
  expectedAgent: decision.expectedAgent,
  decision: 'ALLOW',
  code: 'CONFORMING',
  reason: decision.reason,
  harness: allow()
})

const deniedFact = (error) => ({
  expectedAgent: error.expectedAgent,
  decision: 'DENY',
  code: 'OUT_OF_ORDER',
  reason: error.reason,
  harness: deny(error.reason)
})

const blockedFact = (error) => ({
  expectedAgent: null,
  decision: 'DENY',
  code: error.code,
  reason: error.reason,
  harness: block(error.reason)
})

const unreadableFact = (error) => ({
  expectedAgent: null,
  decision: 'DENY',
  code: 'UNREADABLE_STATE',
  reason: `recorded pipeline state could not be read: ${error?.message ?? String(error)}`,
  harness: block('recorded pipeline state could not be read; dispatch blocked')
})

const decide = (requestedAgent, raw, config) => {
  const state = validateState(raw)
  if (isErr(state)) return blockedFact(state.error)
  const evaluation = evaluateDispatch(requestedAgent, state.value, config)
  if (isErr(evaluation)) {
    return evaluation.error.code === 'OUT_OF_ORDER' ? deniedFact(evaluation.error) : blockedFact(evaluation.error)
  }
  return allowFact(evaluation.value)
}

const auditRecord = (projectSlug, requestedAgent, fact, evaluatedAt) => ({
  event: 'DispatchEvaluated',
  projectSlug,
  requestedAgent,
  expectedAgent: fact.expectedAgent,
  decision: fact.decision,
  code: fact.code,
  reason: fact.reason,
  evaluatedAt
})

export const createPreToolUseService = ({ stateReader, auditWriter, config, clock }) => ({
  handle: async ({ requestedAgent, projectSlug }) => {
    try {
      const evaluatedAt = clock.now()
      const raw = await stateReader.read(projectSlug)
      const fact = decide(requestedAgent, raw, config)
      await auditWriter.write(auditRecord(projectSlug, requestedAgent, fact, evaluatedAt))
      return fact.harness
    } catch (error) {
      const fact = unreadableFact(error)
      try {
        await auditWriter.write(auditRecord(projectSlug, requestedAgent, fact, null))
      } catch { /* even the fallback audit may fail; still fail closed to block */ }
      return fact.harness
    }
  }
})
