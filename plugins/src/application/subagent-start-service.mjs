import { mandatorySkillsFor } from '../domain/skill-policy.mjs'
import { allow, additionalContext } from '../adapters/api/hooks/decision.mjs'

// Builds the verify-mode directive listing mandatory skills with their paths.
const buildVerifyDirective = (skills) => {
  const lines = skills.map((s) => `- ${s}: plugins/skills/${s}/SKILL.md`)
  return `MANDATORY SKILLS: Load the following skills before proceeding:\n${lines.join('\n')}`
}

// Reads each skill's SKILL.md content for eager inlining. Skips unreadable files.
const buildEagerContent = async (skills, filesystem) => {
  const parts = []
  for (const skill of skills) {
    try {
      const content = await filesystem.readFile(`plugins/skills/${skill}/SKILL.md`)
      parts.push(`## Skill: ${skill}\n\n${content}`)
    } catch { /* skip unavailable skills; they still appear in the verify directive */ }
  }
  return parts.join('\n\n')
}

// SubagentStart guard (G2). Injects the mandatory-skill directive into the subagent's
// context so skills are loaded up-front rather than re-discovered mid-run.
// mode "verify" (default): lists required SKILL.md paths.
// mode "eager": inlines SKILL.md content directly.
export const createSubagentStartService = ({ config, filesystem }) => ({
  handle: async ({ agentName, mode } = {}) => {
    const required = mandatorySkillsFor(agentName, config)
    if (required.length === 0) return allow()

    const skillMode = mode ?? 'verify'

    if (skillMode === 'eager') {
      const content = await buildEagerContent(required, filesystem)
      const directive = buildVerifyDirective(required)
      const full = content ? `${directive}\n\n${content}` : directive
      return additionalContext(full)
    }

    return additionalContext(buildVerifyDirective(required))
  }
})
