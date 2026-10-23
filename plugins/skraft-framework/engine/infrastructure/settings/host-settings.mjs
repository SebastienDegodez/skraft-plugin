/**
 * The HostSettings port over the process environment and a host's file functions:
 * `CLAUDE_CODE_EFFORT_LEVEL`, and `.copilot/settings.json` in the developer's home folder.
 * Copilot CLI 1.0.101: the `subagents.agents` key of that file follows the design of the model
 * choice (docs: /agents); its spelling is not measured by the host probe yet.
 * @param {{ files: Pick<import('../tracking/tracking-store.mjs').FileFunctions, 'read' | 'join'>, home: string, env: Record<string, string | undefined> }} options
 * @returns {import('../../application/ports/host-settings.mjs').HostSettings}
 */
export const createHostSettings = ({ files, home, env }) => Object.freeze({
  read: async () => ({
    claudeCodeEffort: env.CLAUDE_CODE_EFFORT_LEVEL || null,
    copilotAgents: copilotAgentsIn(await files.read(files.join(home, '.copilot', 'settings.json'))),
  }),
})

/**
 * The keys under `subagents.agents`; none when the file is absent or holds no such key. A key
 * that is no agent id (the file holds a list or a word there) matches no agent skraft dispatches.
 * @param {string | null} text
 */
const copilotAgentsIn = (text) => {
  try {
    return Object.keys(JSON.parse(/** @type {string} */ (text)).subagents.agents)
  } catch {
    // Stryker disable next-line ArrayDeclaration: an unreadable file names no agent, and a name no dispatched agent has is never reported
    return []
  }
}
