/**
 * AgentCatalog — where an agent a workflow names comes from.
 *
 * @typedef {'plugin' | 'repository'} AgentSource
 *   plugin: an agent skraft ships; repository: one of the working copy (`.claude/agents/`,
 *   `.github/agents/`).
 * @typedef {{ name: string, path: string, text: string }} SkillFile
 *   name: the skill as the descriptor lists it; path: the absolute path of its SKILL.md; text:
 *   what that SKILL.md says.
 * @typedef {{ found: SkillFile[], missing: string[] }} AgentSkills
 *   found: in the order the descriptor lists them; missing: the names found nowhere.
 * @typedef {{
 *   locate: (agent: string) => Promise<AgentSource | null>,
 *   skills: (agent: string) => Promise<AgentSkills>,
 *   skill: (name: string) => Promise<SkillFile | null>,
 * }} AgentCatalog
 *   locate: null when neither the plugin nor the working copy has that agent. skills: the skills
 *   the agent's descriptor lists under `skills:`, each found in the plugin's skills, then the
 *   working copy's (`.claude/skills/`, `.github/skills/`); an agent nobody provides lists none.
 *   skill: the skill of that name, found the same way; null when nobody provides it.
 */
export {}
