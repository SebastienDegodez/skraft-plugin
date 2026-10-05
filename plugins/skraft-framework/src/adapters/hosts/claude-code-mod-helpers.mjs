// Pure helpers of the Claude Code mod adapter (hooks/skraft-mod.mjs). The mod's ports
// themselves live in the hooks module: the mods engine follows `$` only into functions
// of that same file, never across an import, so whatever touches `$` is written there.

export const joinPath = (...parts) => parts.join('/').replace(/\/{2,}/g, '/')

// "Skraft - Software Engineer" → "skraft:software-engineer": the Claude Code agent is
// the alias key that is not the display name (agentAliases in the published config).
export const claudeAgentId = (canonical, config, pluginName) => {
  const kebab = Object.entries(config.agentAliases ?? {})
    .find(([alias, target]) => target === canonical && /^[a-z0-9-]+$/.test(alias))?.[0]
  return kebab ? `${pluginName}:${kebab}` : canonical
}

// Every file under `dir`, `/`-separated and relative to it. `list(dir)` answers the
// entries of one directory as $.fs.list does: { name, kind: 'file' | 'dir' | 'other' }.
export const walkFiles = async (list, dir, prefix = '') => {
  let entries
  try { entries = await list(dir) } catch { return [] }
  const out = []
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.kind === 'dir') out.push(...(await walkFiles(list, joinPath(dir, entry.name), rel)))
    else if (entry.kind === 'file') out.push(rel)
  }
  return out
}

// "/skraft checkout #42 Pay by card" → { slug, story }
export const parseSkraftArgs = (args) => {
  const words = String(args ?? '').trim().split(/\s+/).filter(Boolean)
  const slug = words.shift() ?? null
  const issue = words[0]?.match(/^#?(\d+)$/) ? Number(words.shift().replace('#', '')) : null
  const title = words.join(' ') || null
  return { slug, story: issue || title ? { issue, title } : null }
}

export const askable = (question) => (question.trimEnd().endsWith('?') ? question : `${question.trimEnd()}\nYour answer?`)
