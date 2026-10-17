/** An agent id as the workflow names it: kebab-case, never a path. */
const AGENT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * @typedef {'claude-code' | 'copilot'} AgentHost
 * @typedef {{ plugin: string[][], repository: string[][] }} AgentPlaces
 * @type {Readonly<Record<AgentHost, AgentPlaces>>}
 *   where each host finds an agent, `<id>` standing for its id
 */
const PLACES = Object.freeze({
  'claude-code': { plugin: [['com.anthropic.claude-code', 'agents', '<id>.md']], repository: [['.claude', 'agents', '<id>.md']] },
  copilot: { plugin: [['com.github.copilot', 'agents', '<id>.agent.md']], repository: [['.github', 'agents', '<id>.agent.md'], ['.github', 'agents', '<id>.md']] },
})

/**
 * @typedef {Pick<import('../tracking/tracking-store.mjs').FileFunctions, 'read' | 'join'>} CatalogFiles
 * @typedef {{ files: CatalogFiles, pluginRoot: string, root: string, places: AgentPlaces[] }} Catalog
 */

/**
 * The agents skraft ships and those of the working copy, as the host that starts them sees
 * them: Claude Code reads `.claude/agents/`, Copilot `.github/agents/`; with no host (the CLI),
 * either. No Node API here.
 * @param {{ files: CatalogFiles, pluginRoot: string, root: string, host?: AgentHost }} options
 *   root: the working copy
 * @returns {import('../../application/ports/agent-catalog.mjs').AgentCatalog}
 */
export const createAgentCatalog = ({ files, pluginRoot, root, host }) => {
  const places = host ? [PLACES[host]] : Object.values(PLACES)
  return Object.freeze({
    locate: (agent) => locateAgent({ files, pluginRoot, root, places }, agent),
  })
}

/** The plugin's agent first, then the working copy's. @param {Catalog} catalog @param {string} agent */
const locateAgent = async ({ files, pluginRoot, root, places }, agent) => {
  if (!AGENT_ID.test(agent)) return null
  if (await anyExists(files, candidates(places, 'plugin', pluginRoot, agent))) return 'plugin'
  if (await anyExists(files, candidates(places, 'repository', root, agent))) return 'repository'
  return null
}

/**
 * Every path, under `from`, where the hosts' places on one side name the agent.
 * @param {AgentPlaces[]} places @param {'plugin' | 'repository'} side @param {string} from @param {string} agent
 */
const candidates = (places, side, from, agent) => places.flatMap((place) => place[side].map((path) => [from, ...withId(path, agent)]))

/** @param {string[]} path @param {string} agent */
const withId = (path, agent) => path.map((part) => part.replace('<id>', agent))

/** Read in order, stopping at the first found. @param {CatalogFiles} files @param {string[][]} paths */
const anyExists = async (files, paths) => {
  for (const path of paths) if ((await files.read(files.join(...path))) !== null) return true
  return false
}
