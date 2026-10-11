// Pure domain: resolve the agent identities harnesses report to one canonical name.

// Claude Code reports a plugin subagent as `skraft:<id>` or `plugin:skraft:<id>`;
// only this plugin's namespace is unwrapped, never a foreign one.
const SKRAFT_NAMESPACE = /^(?:plugin:)?skraft:/

const unqualified = (agentName) => String(agentName ?? '').trim().replace(SKRAFT_NAMESPACE, '')

export const canonicalAgentName = (agentName, config) => {
  const value = String(agentName ?? '').trim()
  if (!value) return undefined
  const aliases = config?.agentAliases ?? {}
  return aliases[value] ?? aliases[unqualified(value)] ?? unqualified(value)
}
