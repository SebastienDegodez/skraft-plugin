// PostToolUse service. Two independent, fail-open concerns:
//   - G3 skill-read tracer: journals every SKILL.md file read to the audit JSONL.
//   - G6 orchestrator continuation: on PostToolUse(Agent), when a phase agent returns,
//     injects the state.mjs recording steps and the next dispatch for its role.
// Fail-open (ADR-006): any internal error must never deny the tool use.
import { allow, additionalContext } from '../adapters/api/hooks/decision.mjs'
import { projectDispatchState } from '../domain/state-schema.mjs'
import { continuationAfter } from '../domain/pipeline-policy.mjs'
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

export const createPostToolUseService = ({ auditWriter, clock, stateReader, config } = {}) => {
  // G6: after a phase agent returns, remind the orchestrator what to record next.
  const continuationFor = async ({ agentName, projectSlug }) => {
    // No stateReader/slug → skip G6, fail-open.
    if (!stateReader || !projectSlug) return allow()

    const projected = projectDispatchState(await stateReader.read(projectSlug))
    if (!isOk(projected)) return allow()

    const continuation = continuationAfter(agentName, projected.value, config ?? {})
    if (!continuation) return allow()
    await auditWriter.write({
      eventType: 'ContinuationInjected',
      agentName,
      phase: projected.value.currentPhase,
      kind: continuation.kind,
      timestamp: clock.now()
    }).catch(() => {})
    return additionalContext(continuation.context)
  }

  return {
    handle: async ({ toolName, agentName, requestedAgent, toolInput, projectSlug } = {}) => {
      try {
        if (toolName === AGENT_TOOL) {
          // The returning agent is the one the tool dispatched, not the hook's caller.
          const finishedAgent = requestedAgent ?? toolInput?.subagentType ?? toolInput?.subagent_type
          return await continuationFor({ agentName: finishedAgent, projectSlug })
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
