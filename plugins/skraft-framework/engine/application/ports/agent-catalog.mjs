/**
 * AgentCatalog — where an agent a workflow names comes from.
 *
 * @typedef {'plugin' | 'repository'} AgentSource
 *   plugin: an agent skraft ships; repository: one of the working copy (`.claude/agents/`,
 *   `.github/agents/`).
 * @typedef {{ locate: (agent: string) => Promise<AgentSource | null> }} AgentCatalog
 *   locate: null when neither the plugin nor the working copy has that agent.
 */
export {}
