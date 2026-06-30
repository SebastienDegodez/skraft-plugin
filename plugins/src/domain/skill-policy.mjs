// Pure domain: skill-loading policy helpers. No IO.

// Pattern: any kebab-case folder segment directly before /SKILL.md in a path.
const SKILL_MD_RE = /([a-z0-9][a-z0-9-]*)\/SKILL\.md/g

// Returns the SkillEntry[] the agent must load, derived from config.agentSkills.
// Each entry: { name: string, policy: 'verify' | 'eager' }
export const mandatorySkillsFor = (agentName, config) => {
  const skills = config?.agentSkills?.[agentName] ?? []
  return skills.map((s) => (typeof s === 'string' ? { name: s, policy: 'verify' } : s))
}

// Returns true when the skill entry has policy 'eager'.
export const isEagerSkill = (skill) => skill?.policy === 'eager'

// Returns required skill names that are absent from readSkills.
export const missingSkills = (readSkills, requiredNames) => {
  const readSet = new Set(readSkills)
  return requiredNames.filter((s) => !readSet.has(s))
}

// Extracts all skill names read from a transcript (string or array).
export const extractReadSkills = (transcript) => {
  const text = typeof transcript === 'string' ? transcript : JSON.stringify(transcript ?? '')
  const found = new Set()
  for (const [, name] of text.matchAll(SKILL_MD_RE)) {
    found.add(name)
  }
  return [...found]
}
