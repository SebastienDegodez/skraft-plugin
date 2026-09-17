// Pure domain: resolve harness agent identities and companion-instruction policy.

const unqualified = (agentName) => {
  const value = String(agentName ?? '').trim()
  return value.startsWith('skraft:') ? value.slice('skraft:'.length) : value
}

export const canonicalAgentName = (agentName, config) => {
  const value = String(agentName ?? '').trim()
  if (!value) return undefined
  const aliases = config?.agentAliases ?? {}
  return aliases[value] ?? aliases[unqualified(value)] ?? unqualified(value)
}

export const companionInstructionsFor = (agentName, config) => {
  const canonical = canonicalAgentName(agentName, config)
  if (!canonical) return []
  const instructions = config?.agentInstructions?.[canonical] ?? []
  return Array.isArray(instructions) ? [...instructions] : []
}
