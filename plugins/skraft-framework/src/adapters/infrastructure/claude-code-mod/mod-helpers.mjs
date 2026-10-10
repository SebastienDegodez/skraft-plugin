// Pure helpers of the Claude Code mod's driven adapters. The adapters themselves live in
// hooks/skraft-mod.mjs: the mods engine follows `$` only into functions declared in the
// hooks module, never across an import. Whatever does not touch `$` lives here.

export const joinPath = (...parts) => parts.join('/').replace(/\/{2,}/g, '/')

// AgentRunner id mapping: "Skraft - Software Engineer" → "skraft:software-engineer", the
// alias key of agentAliases that is not the display name, under the plugin's namespace.
// null (the report transport) is Claude Code's general-purpose agent, which sees MCP tools.
export const claudeAgentId = (canonical, config, pluginName) => {
  if (canonical === null) return 'general-purpose'
  const kebab = Object.entries(config.agentAliases ?? {})
    .find(([alias, target]) => target === canonical && /^[a-z0-9-]+$/.test(alias))?.[0]
  return kebab ? `${pluginName}:${kebab}` : canonical
}

// TrackingStore.list: every file under `dir`, '/'-separated, relative to it.
// `listDirectory(dir)` answers entries as $.fs.list does: { name, kind: 'file' | 'dir' | 'other' }.
export const walkFiles = async (listDirectory, dir, prefix = '') => {
  let entries
  try { entries = await listDirectory(dir) } catch { return [] }
  const out = []
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.kind === 'dir') out.push(...(await walkFiles(listDirectory, joinPath(dir, entry.name), rel)))
    else if (entry.kind === 'file') out.push(rel)
  }
  return out.sort()
}

// HumanInteraction: the engine's question dialog wants a question ending in '?'.
export const askable = (question) => (question.trimEnd().endsWith('?') ? question : `${question.trimEnd()}\nYour answer?`)

// AgentRunner usage from a subagent's turn.complete usage (tokens, model) and the session's
// dollar cost before and after it ($.session.usage().cost.usd). The difference is the
// dispatch's when nothing else spent meanwhile — RunPipeline dispatches one agent at a time.
export const claudeUsage = (turnUsage, usdBefore, usdAfter) => {
  const usd = typeof usdBefore === 'number' && typeof usdAfter === 'number' && usdAfter >= usdBefore ? usdAfter - usdBefore : undefined
  if (!turnUsage && usd === undefined) return undefined
  return Object.freeze({
    model: turnUsage?.model ?? null,
    inputTokens: turnUsage?.input_tokens ?? 0,
    outputTokens: turnUsage?.output_tokens ?? 0,
    cacheReadTokens: turnUsage?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: turnUsage?.cache_creation_input_tokens ?? 0,
    ...(usd === undefined ? {} : { usd }),
  })
}

// G8 caller of a tool call, from what the mods engine says about its loop: `agentId` (the
// call's loop; absent on the main loop), `agents` ($.agent.list(): id, type, parentId,
// spawnedBy) and `mainAgent` (the main loop's agent type, from SessionStart's agent_type
// under --agent). The chain is the caller's type, then its spawners' up to the main loop;
// an agent this plugin's pipeline spawned has no agent above it. null: the engine lists no
// such agent — the caller is unidentified.
export const callerChain = ({ agentId, agents = [], mainAgent = null, pluginName = null } = {}) => {
  const main = typeof mainAgent === 'string' && mainAgent.length > 0 ? [mainAgent] : []
  if (!agentId) return { chain: main }
  const byId = new Map((Array.isArray(agents) ? agents : []).map((agent) => [agent?.id, agent]))
  const chain = []
  let current = byId.get(agentId)
  if (!current) return null
  while (current && !chain.includes(current)) {
    chain.push(current)
    if (pluginName && current.spawnedBy === pluginName) return { chain: chain.map((agent) => agent.type) }
    if (!current.parentId) return { chain: [...chain.map((agent) => agent.type), ...main] }
    current = byId.get(current.parentId)
  }
  return { chain: chain.map((agent) => agent.type) }
}

// The last segment of a '/'-separated path: the tracking directory's name G7 and G8 read.
export const lastSegment = (path) => String(path ?? '').replace(/[/\\]+$/, '').split(/[/\\]/).pop()
