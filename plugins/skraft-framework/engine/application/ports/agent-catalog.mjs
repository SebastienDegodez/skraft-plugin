/**
 * AgentCatalog — where an agent a workflow names comes from.
 *
 * @typedef {'plugin' | 'repository'} AgentSource
 *   plugin: an agent skraft ships; repository: one of the working copy (`.claude/agents/`,
 *   `.github/agents/`).
 * @typedef {{ name: string, path: string }} SkillFile
 *   name: the skill as the descriptor lists it; path: the absolute path of its SKILL.md.
 * @typedef {{ found: SkillFile[], missing: string[] }} AgentSkills
 *   found: in the order the descriptor lists them; missing: the names found nowhere.
 * @typedef {{
 *   locate: (agent: string) => Promise<AgentSource | null>,
 *   skills: (agent: string) => Promise<AgentSkills>,
 * }} AgentCatalog
 *   locate: null when neither the plugin nor the working copy has that agent. skills: the skills
 *   the agent's descriptor lists under `skills:`, each found in the plugin's skills, then the
 *   working copy's (`.claude/skills/`, `.github/skills/`); an agent nobody provides lists none.
 */
export {}
