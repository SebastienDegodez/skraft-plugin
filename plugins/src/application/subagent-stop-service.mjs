import { mandatorySkillsFor, missingSkills, extractReadSkills } from '../domain/skill-policy.mjs'
import { allow, block } from '../adapters/api/hooks/decision.mjs'

// SubagentStop skill guard (G2). Reads the transcript via the per-invocation factory,
// extracts all SKILL.md reads, and blocks if any mandatory skill was never loaded.
// Fail-open on transcript unavailability (ADR-006): monitoring failure ≠ compliance signal.
export const createSubagentStopService = ({ config, transcriptReaderFactory, auditWriter, clock }) => ({
  handle: async ({ agentName, transcript } = {}) => {
    try {
      const skillEntries = mandatorySkillsFor(agentName, config)
      if (skillEntries.length === 0) return allow()

      const requiredNames = skillEntries.map((s) => s.name)
      const now = clock.now()

      let readSkills
      try {
        const content = await transcriptReaderFactory({ transcript }).read()
        readSkills = extractReadSkills(content)
      } catch {
        // ADR-006: transcript unavailable is a monitoring failure, not a compliance signal
        await auditWriter.write({
          eventType: 'SkillComplianceChecked',
          agentName,
          decision: 'ALLOW',
          reason: 'transcript_unavailable',
          timestamp: now
        }).catch(() => {})
        return allow()
      }

      const missing = missingSkills(readSkills, requiredNames)
      const decision = missing.length > 0 ? 'BLOCK' : 'ALLOW'

      await auditWriter.write({
        eventType: 'SkillComplianceChecked',
        agentName,
        decision,
        missingSkills: missing,
        ...(missing.length === 0 && { reason: 'all_present' }),
        timestamp: now
      }).catch(() => {})

      if (missing.length > 0) {
        return block(`Mandatory skill not loaded: ${missing[0]}`)
      }
      return allow()
    } catch {
      // Fail-open: any unexpected crash must not block the agent (ADR-006)
      return allow()
    }
  }
})
