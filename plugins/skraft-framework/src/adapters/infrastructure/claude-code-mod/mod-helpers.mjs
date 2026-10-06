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
