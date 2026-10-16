/** An agent id as the workflow names it: kebab-case, never a path. */
const AGENT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * The agents skraft ships (both plugin trees) and those of the working copy
 * (`.claude/agents/`, `.github/agents/`). No Node API here.
 * @param {{ files: Pick<import('../tracking/tracking-store.mjs').FileFunctions, 'read' | 'join'>, pluginRoot: string, root: string }} options
 *   root: the working copy
 * @returns {import('../../application/ports/agent-catalog.mjs').AgentCatalog}
 */
export const createAgentCatalog = ({ files, pluginRoot, root }) => {
  /** @param {string[][]} paths */
  const anyExists = async (paths) => {
    for (const path of paths) if ((await files.read(files.join(...path))) !== null) return true
    return false
  }
  return Object.freeze({
    locate: async (agent) => {
      if (!AGENT_ID.test(agent)) return null
      if (await anyExists([
        [pluginRoot, 'com.anthropic.claude-code', 'agents', `${agent}.md`],
        [pluginRoot, 'com.github.copilot', 'agents', `${agent}.agent.md`],
      ])) return 'plugin'
      if (await anyExists([
        [root, '.claude', 'agents', `${agent}.md`],
        [root, '.github', 'agents', `${agent}.agent.md`],
        [root, '.github', 'agents', `${agent}.md`],
      ])) return 'repository'
      return null
    },
  })
}
