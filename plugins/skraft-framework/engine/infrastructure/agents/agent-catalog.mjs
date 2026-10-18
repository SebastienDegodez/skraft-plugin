/** An agent id as the workflow names it: kebab-case, never a path. */
const AGENT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * @typedef {'claude-code' | 'copilot'} AgentHost
 * @typedef {{ plugin: string[][], repository: string[][] }} AgentPlaces
 *   where each host finds an agent, `<id>` standing for its id
 */
const PLACES = /** @type {Readonly<Record<AgentHost, AgentPlaces>>} */ (Object.freeze({
  'claude-code': { plugin: [['com.anthropic.claude-code', 'agents', '<id>.md']], repository: [['.claude', 'agents', '<id>.md']] },
  copilot: { plugin: [['com.github.copilot', 'agents', '<id>.agent.md']], repository: [['.github', 'agents', '<id>.agent.md'], ['.github', 'agents', '<id>.md']] },
}))

/** Where a skill a descriptor lists is looked for, `<id>` standing for its name. */
const SKILL_PLACES = Object.freeze({ plugin: [['skills', '<id>', 'SKILL.md']], repository: [['.claude', 'skills', '<id>', 'SKILL.md'], ['.github', 'skills', '<id>', 'SKILL.md']] })

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
    skills: (agent) => skillsOf({ files, pluginRoot, root, places }, agent),
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
const anyExists = async (files, paths) => (await firstFound(files, paths)) !== null

/**
 * The first of the paths that exists, with its text; null when none does.
 * @param {CatalogFiles} files @param {string[][]} paths
 * @returns {Promise<{ path: string, text: string } | null>}
 */
const firstFound = async (files, paths) => {
  for (const parts of paths) {
    const path = files.join(...parts)
    const text = await files.read(path)
    if (text !== null) return { path, text }
  }
  return null
}

/**
 * @param {Catalog} catalog @param {string} agent
 * @returns {Promise<import('../../application/ports/agent-catalog.mjs').AgentSkills>}
 */
const skillsOf = async (catalog, agent) => {
  const names = declaredSkills((await descriptorOf(catalog, agent))?.text ?? '')
  const files = await Promise.all(names.map((skill) => skillFile(catalog, skill)))
  return {
    found: names.flatMap((name, index) => (files[index] === null ? [] : [{ name, ...files[index] }])),
    missing: names.filter((_, index) => files[index] === null),
  }
}

/** The agent's descriptor, the plugin's first; null for a name that is no agent id. @param {Catalog} catalog @param {string} agent */
const descriptorOf = async ({ files, places, pluginRoot, root }, agent) => {
  if (!AGENT_ID.test(agent)) return null
  return firstFound(files, [...candidates(places, 'plugin', pluginRoot, agent), ...candidates(places, 'repository', root, agent)])
}

/** @param {Catalog} catalog @param {string} skill */
const skillFile = ({ files, pluginRoot, root }, skill) => firstFound(files, [...candidates([SKILL_PLACES], 'plugin', pluginRoot, skill), ...candidates([SKILL_PLACES], 'repository', root, skill)])

/**
 * The skill names a descriptor's front matter lists under a `skills:` key, at any depth; names
 * that are not kebab-case ids are left out.
 * @param {string} text
 */
const declaredSkills = (text) => {
  const frontMatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? ''
  const lines = frontMatter.split(/\r?\n/)
  const start = lines.findIndex((line) => /^\s*skills:\s*$/.test(line))
  if (start < 0) return []
  const indent = /^\s*/.exec(lines[start])?.[0].length ?? 0
  const items = lines.slice(start + 1).map((line) => /^(\s*)-\s*([^\s#]+)\s*(?:#.*)?$/.exec(line))
  const end = items.findIndex((match) => match === null || match[1].length < indent)
  return items.slice(0, end < 0 ? items.length : end).map((match) => /** @type {RegExpExecArray} */ (match)[2]).filter((name) => AGENT_ID.test(name))
}
