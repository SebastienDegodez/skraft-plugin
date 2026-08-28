import { mandatorySkillsFor, isEagerSkill } from '../domain/skill-policy.mjs'
import { canonicalAgentName, companionInstructionsFor } from '../domain/instruction-policy.mjs'
import { allow, additionalContext } from '../adapters/api/hooks/decision.mjs'

// Builds the directive listing all mandatory skills by name.
const buildDirective = (skillEntries) => {
  const names = skillEntries.map((s) => s.name).join(', ')
  return `The following skills are MANDATORY: ${names}`
}

// SubagentStart guard (G2). Injects the mandatory-skill directive into the subagent's
// context so skills are loaded up-front. Skills with policy 'eager' have their SKILL.md
// content inlined. Fail-open on read errors (ADR-006).
export const createSubagentStartService = ({
  config,
  skillFileReader,
  instructionFileReader,
  auditWriter,
  clock,
}) => ({
  handle: async ({ agentName, harness } = {}) => {
    const canonicalName = canonicalAgentName(agentName, config)
    const skillEntries = mandatorySkillsFor(canonicalName, config)
    const instructionPaths = harness === 'claude-code'
      ? companionInstructionsFor(canonicalName, config)
      : []
    if (skillEntries.length === 0 && instructionPaths.length === 0) return allow()

    const parts = []
    if (skillEntries.length > 0) parts.push(buildDirective(skillEntries))

    const eagerSkills = skillEntries.filter(isEagerSkill)
    for (const skill of eagerSkills) {
      try {
        const content = await skillFileReader.read(skill.name)
        parts.push(content)
      } catch (err) {
        // ADR-006: fail-open; record warn audit so monitoring can detect the gap
        const ts = (() => { try { return clock.now() } catch { return new Date().toISOString() } })()
        await auditWriter.write({
          eventType: 'EagerReadFailed',
          agentName: canonicalName,
          skillName: skill.name,
          decision: 'WARN',
          reason: err?.message ?? 'unknown',
          timestamp: ts
        }).catch(() => {})
      }
    }

    for (const instructionPath of instructionPaths) {
      try {
        const content = await instructionFileReader.read(instructionPath)
        parts.push(`Companion instruction: ${instructionPath}\n\n${content}`)
      } catch (err) {
        // Context injection is guidance, not a session gate. Preserve fail-open behavior
        // while making missing packaged rules visible in the audit stream.
        const ts = (() => { try { return clock.now() } catch { return new Date().toISOString() } })()
        await auditWriter.write({
          eventType: 'InstructionReadFailed',
          agentName: canonicalName,
          instructionPath,
          decision: 'WARN',
          reason: err?.message ?? 'unknown',
          timestamp: ts,
        }).catch(() => {})
      }
    }

    return parts.length > 0 ? additionalContext(parts.join('\n\n')) : allow()
  }
})
