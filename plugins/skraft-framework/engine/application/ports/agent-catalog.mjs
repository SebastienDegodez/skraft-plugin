/**
 * AgentCatalog — where an agent a workflow names comes from.
 *
 * @typedef {'plugin' | 'repository'} AgentSource
 *   plugin: an agent skraft ships; repository: one of the working copy (`.claude/agents/`,
 *   `.github/agents/`).
 * @typedef {{
 *   locate: (agent: string) => Promise<AgentSource | null>,
 *   skills: (agent: string) => Promise<string[]>,
 * }} AgentCatalog
 *   locate: null when neither the plugin nor the working copy has that agent. skills: the
 *   absolute paths of the SKILL.md files the agent's descriptor lists under `skills:`, found in
 *   the plugin's skills, then the working copy's (`.claude/skills/`, `.github/skills/`); a skill
 *   found nowhere is left out.
 */
export {}
