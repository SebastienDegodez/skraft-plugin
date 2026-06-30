import { mandatorySkillsFor, isEagerSkill } from '../domain/skill-policy.mjs'
import { allow, additionalContext } from '../adapters/api/hooks/decision.mjs'

// Builds the directive listing all mandatory skills by name.
const buildDirective = (skillEntries) => {
  const names = skillEntries.map((s) => s.name).join(', ')
  return `The following skills are MANDATORY: ${names}`
}

// SubagentStart guard (G2). Injects the mandatory-skill directive into the subagent's
// context so skills are loaded up-front. Skills with policy 'eager' have their SKILL.md
// content inlined. Fail-open on read errors (ADR-006).
export const createSubagentStartService = ({ config, skillFileReader, auditWriter, clock }) => ({
  handle: async ({ agentName } = {}) => {
    const skillEntries = mandatorySkillsFor(agentName, config)
    if (skillEntries.length === 0) return allow()

    const directive = buildDirective(skillEntries)
    const parts = [directive]

    const eagerSkills = skillEntries.filter(isEagerSkill)
    for (const skill of eagerSkills) {
      try {
        const content = await skillFileReader.read(skill.name)
        parts.push(content)
      } catch {
        // ADR-006: fail-open; record warn audit so monitoring can detect the gap
        await auditWriter.write({
          eventType: 'EagerReadFailed',
          agentName,
          skillName: skill.name,
          decision: 'WARN',
          timestamp: clock.now()
        }).catch(() => {})
      }
    }

    return additionalContext(parts.join('\n\n'))
  }
})
