// PostToolUse service. Two independent, fail-open concerns:
//   - G3 skill-read tracer: journals every SKILL.md file read to the audit JSONL.
//   - G6 orchestrator continuation: on PostToolUse(Agent), injects the next-step
//     context (success) or a re-dispatch context (reviewer requested changes) so the
//     orchestrator does not have to be re-prompted between phases.
// Fail-open (ADR-006): any internal error must never deny the tool use.
import { allow, additionalContext } from '../adapters/api/hooks/decision.mjs'
import { validateState } from '../domain/state-schema.mjs'
import { expectedNextAgent } from '../domain/pipeline-policy.mjs'
import { isOk } from '../domain/result.mjs'

const SKILL_MD_PATH_RE =
  /(?:plugins\/skraft-framework\/skills|\.agents\/skills|\.github\/skills|\.copilot\/skills)\/([^/]+)\/SKILL\.md$/i

// The subagent-dispatch tool. PostToolUse(Agent) fires after a sub-agent finishes.
const AGENT_TOOL = 'Agent'

// Equivalent mutants (not testable beyond try-catch observable boundary):
//   - ConditionalExpression: `typeof path === 'string'` → defensive guard; try-catch makes it equivalent
//   - OptionalChaining: `toolInput?.path` → defensive guard; try-catch makes it equivalent
const extractSkillName = (path) => {
  const match = typeof path === 'string' ? path.match(SKILL_MD_PATH_RE) : null
  return match ? match[1] : null
}

// Maps the pure pipeline-policy verdict into an orchestrator-facing continuation.
// Returns { context, audit }. A null context means "inject nothing" (fail-open).
const describeContinuation = (expected, phase, agentName) => {
  if (isOk(expected)) {
    const { agent, stage, reason } = expected.value
    if (stage === 'RETRY') {
      // Reviewer requested changes → ask orchestrator to re-dispatch with gaps.
      return {
        context: `SKRAFT G6 — ${phase} reviewer requested changes. ` +
          `Re-dispatch ${agent} to address reviewer's recorded gaps for ${phase} before advancing. ${reason}`,
        audit: { eventType: 'ContinuationInjected', agentName, phase, stage, expectedAgent: agent, kind: 'REDISPATCH' }
      }
    }
    // Success → remind orchestrator of next phase/step to dispatch.
    return {
      context: `SKRAFT G6 — next: dispatch ${agent} (${stage}) for ${phase}. ${reason}`,
      audit: { eventType: 'ContinuationInjected', agentName, phase, stage, expectedAgent: agent, kind: 'NEXT_STEP' }
    }
  }

  const { code, reason } = expected.error
  if (code === 'PIPELINE_COMPLETE') {
    return {
      context: `SKRAFT G6 — pipeline completed final phase ${phase}. ${reason}`,
      audit: { eventType: 'ContinuationInjected', agentName, phase, kind: 'COMPLETE' }
    }
  }
  if (code === 'RETRY_EXHAUSTED') {
    return {
      context: `SKRAFT G6 — ${phase} exhausted retry budget; escalate to user instead of re-dispatching. ${reason}`,
      audit: { eventType: 'ContinuationInjected', agentName, phase, kind: 'ESCALATE' }
    }
  }
  // INVALID_STATE (or any unresolvable state) → inject nothing, stay out of way.
  return {
    context: null,
    audit: { eventType: 'ContinuationInjected', agentName, phase, kind: 'SKIPPED', reason }
  }
}

export const createPostToolUseService = ({ auditWriter, clock, stateReader, config } = {}) => {
  // G6: derive and inject the orchestrator continuation for a finished sub-agent.
  const continuationFor = async ({ agentName, projectSlug }) => {
    // No stateReader/slug → skip G6, fail-open.
    if (!stateReader || !projectSlug) return allow()

    const raw = await stateReader.read(projectSlug)
    const validated = validateState(raw)
    // Equivalent mutant: `if (false)` still fails open — expectedNextAgent(undefined)
    // throws on the invalid state and the outer try-catch returns allow() all the same.
    if (!isOk(validated)) return allow()

    const expected = expectedNextAgent(validated.value, config ?? {})
    const { context, audit } = describeContinuation(expected, validated.value.currentPhase, agentName)
    await auditWriter.write({ ...audit, timestamp: clock.now() }).catch(() => {})
    return context ? additionalContext(context) : allow()
  }

  return {
    handle: async ({ toolName, agentName, toolInput, projectSlug } = {}) => {
      try {
        if (toolName === AGENT_TOOL) {
          return await continuationFor({ agentName, projectSlug })
        }

        // G3 skill-read tracer.
        const path = toolInput?.path
        const skillName = extractSkillName(path)
        if (skillName) {
          await auditWriter.write({
            eventType: 'SkillRead',
            agentName,
            skillName,
            path,
            timestamp: clock.now()
          })
        }
      } catch { /* fail-open: logging/continuation errors must never interrupt tool use */ }
      return allow()
    }
  }
}
