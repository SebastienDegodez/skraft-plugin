/** An agent id as the workflow names it: kebab-case, never a path. */
const AGENT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * @typedef {'claude-code' | 'copilot'} AgentHost
 * @type {Readonly<Record<AgentHost, { plugin: string[][], repository: string[][] }>>}
 *   where each host finds an agent, `<id>` standing for its id
 */
const PLACES = Object.freeze({
  'claude-code': { plugin: [['com.anthropic.claude-code', 'agents', '<id>.md']], repository: [['.claude', 'agents', '<id>.md']] },
  copilot: { plugin: [['com.github.copilot', 'agents', '<id>.agent.md']], repository: [['.github', 'agents', '<id>.agent.md'], ['.github', 'agents', '<id>.md']] },
})

/**
 * The agents skraft ships and those of the working copy, as the host that starts them sees
 * them: Claude Code reads `.claude/agents/`, Copilot `.github/agents/`; with no host (the CLI),
 * either. No Node API here.
 * @param {{ files: Pick<import('../tracking/tracking-store.mjs').FileFunctions, 'read' | 'join'>, pluginRoot: string, root: string, host?: AgentHost }} options
 *   root: the working copy
 * @returns {import('../../application/ports/agent-catalog.mjs').AgentCatalog}
 */
export const createAgentCatalog = ({ files, pluginRoot, root, host }) => {
  const places = host ? [PLACES[host]] : Object.values(PLACES)
  /** @param {string[][]} paths */
  const anyExists = async (paths) => {
    for (const path of paths) if ((await files.read(files.join(...path))) !== null) return true
    return false
  }
  return Object.freeze({
    locate: async (agent) => {
      if (!AGENT_ID.test(agent)) return null
      const named = (/** @type {string} */ from, /** @type {string[][]} */ paths) => paths.map((path) => [from, ...path.map((part) => part.replace('<id>', agent))])
      if (await anyExists(places.flatMap((place) => named(pluginRoot, place.plugin)))) return 'plugin'
      if (await anyExists(places.flatMap((place) => named(root, place.repository)))) return 'repository'
      return null
    },
  })
}
