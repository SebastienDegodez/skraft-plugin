import { mandatorySkillsFor, isEagerSkill } from '../domain/skill-policy.mjs'
import { canonicalAgentName } from '../domain/instruction-policy.mjs'
import { allow, additionalContext } from '../adapters/api/hooks/decision.mjs'

// Builds the directive listing all mandatory skills by name, and how G3 counts a load:
// only a skill tool call (or a read of the skill's SKILL.md) — never a mention.
const buildDirective = (skillEntries) => {
  const names = skillEntries.map((s) => s.name).join(', ')
  return `The following skills are MANDATORY: ${names}. Load each with your skill tool, by name, before any other work; a skill you only name or read about is not loaded, and the agent cannot stop until it is.`
}

// SubagentStart guard (G2). Injects the mandatory-skill directive into the subagent's
// context so skills are loaded up-front. Skills with policy 'eager' have their SKILL.md
// content inlined. Fail-open on read errors (ADR-006). Companion rules are not injected:
// the orchestrator, their only reader, loads them itself on every harness.
export const createSubagentStartService = ({
  config,
  skillFileReader,
  auditWriter,
  clock,
}) => ({
  handle: async ({ agentName } = {}) => {
    const canonicalName = canonicalAgentName(agentName, config)
    const skillEntries = mandatorySkillsFor(canonicalName, config)
    if (skillEntries.length === 0) return allow()

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

    return parts.length > 0 ? additionalContext(parts.join('\n\n')) : allow()
  }
})
