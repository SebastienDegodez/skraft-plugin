import { mandatorySkillsFor, missingSkills, extractReadSkills } from '../domain/skill-policy.mjs'
import { allow, block } from '../adapters/api/hooks/decision.mjs'

// SubagentStop skill guard (G2). Scans the subagent transcript for SKILL.md reads and
// blocks if any mandatory skill was never loaded, forcing a re-run with the missing skills.
export const createSubagentStopService = ({ config, auditWriter, clock }) => ({
  handle: async ({ agentName, transcript } = {}) => {
    try {
      const required = mandatorySkillsFor(agentName, config)
      if (required.length === 0) return allow()

      const readSkills = extractReadSkills(transcript)
      const missing = missingSkills(readSkills, required)

      const now = clock.now()
      await auditWriter.write({
        event: 'SkillGuardEvaluated',
        agentName,
        required,
        readSkills,
        missing,
        decision: missing.length > 0 ? 'BLOCK' : 'ALLOW',
        evaluatedAt: now
      })

      if (missing.length > 0) {
        const reason = `mandatory skills not loaded: ${missing.join(', ')}`
        return block(reason)
      }
      return allow()
    } catch {
      // Fail-open: a guard crash must not block the agent.
      return allow()
    }
  }
})
