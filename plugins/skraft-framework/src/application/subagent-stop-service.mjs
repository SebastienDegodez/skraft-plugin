import { mandatorySkillsFor, missingSkills, extractReadSkills } from '../domain/skill-policy.mjs'
import { canonicalAgentName } from '../domain/instruction-policy.mjs'
import { allow, block } from '../adapters/api/hooks/decision.mjs'

// SubagentStop guard (G3): reads the finished subagent's transcript and blocks when a
// mandatory skill was never loaded. Fail-open on transcript unavailability (ADR-006):
// monitoring failure ≠ compliance signal. Phase completion (G4/G5) is not checked here —
// the orchestrator records artefacts and verdicts only after the subagent returns, so
// the state CLI gates it when the phase closes.
// A subagent already continuing from a previous block (stop_hook_active) is let go:
// a block it cannot satisfy would otherwise relaunch it until the token budget runs out.
export const createSubagentStopService = ({ config, transcriptReaderFactory, auditWriter, clock }) => ({
  handle: async ({ agentName, transcript, agent_transcript_path, agentTranscriptPath, stop_hook_active, stopHookActive } = {}) => {
    try {
      agentName = canonicalAgentName(agentName, config)
      if ((stopHookActive ?? stop_hook_active) === true) {
        await auditWriter.write({
          eventType: 'SubagentStopLoopBroken',
          agentName,
          decision: 'ALLOW',
          reason: 'stop_hook_active',
          timestamp: clock.now()
        }).catch(() => {})
        return allow()
      }
      const skillEntries = mandatorySkillsFor(agentName, config)
      if (skillEntries.length > 0) {
        const requiredNames = skillEntries.map((s) => s.name)
        const now = clock.now()

        let readSkills
        try {
          const content = await transcriptReaderFactory({
            transcript,
            agentTranscriptPath: agentTranscriptPath ?? agent_transcript_path
          }).read()
          readSkills = extractReadSkills(content)
        } catch {
          // ADR-006: transcript unavailable is a monitoring failure, not a compliance signal
          await auditWriter.write({
            eventType: 'SkillComplianceChecked',
            agentName,
            decision: 'ALLOW',
            reason: 'transcript_unavailable',
            missingSkills: [],
            timestamp: now
          }).catch(() => {})
        }

        if (readSkills !== undefined) {
          const missing = missingSkills(readSkills, requiredNames)
          const decision = missing.length > 0 ? 'BLOCK' : 'ALLOW'

          await auditWriter.write({
            eventType: 'SkillComplianceChecked',
            agentName,
            decision,
            missingSkills: missing,
            reason: missing.length === 0 ? 'all_present' : 'skill_absent',
            timestamp: now
          }).catch(() => {})

          if (missing.length > 0) {
            return block(`Mandatory skill not loaded: ${missing[0]}`)
          }
        }
      }

      return allow()
    } catch {
      // Fail-open: any unexpected crash must not block the agent (ADR-006)
      return allow()
    }
  }
})
