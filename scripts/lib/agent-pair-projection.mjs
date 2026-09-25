import { basename, dirname } from 'node:path'
import { agentAliases, claudeAgents, copilotAgents, translateAgentLinks } from './agent-links.mjs'
import { mergeAgentPair, parseBaseline } from './agent-sync.mjs'

// IO is injected by the containment-checked adapter. Every conflict is collected
// before its caller can write descriptors, hooks or baseline.
export function buildPairProjection({ root, list, read, exists }) {
  const sides = { claude: claudeAgents, copilot: copilotAgents }
  const inventory = {}
  const extra = []
  for (const [side, directory] of Object.entries(sides)) {
    inventory[side] = new Map()
    const suffix = side === 'claude' ? '.md' : '.agent.md'
    for (const path of list(directory)) {
      const name = basename(path)
      const id = name.slice(0, -suffix.length)
      if (dirname(path) !== directory || !name.endsWith(suffix) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
        extra.push(path)
        continue
      }
      if (inventory[side].has(id)) throw new Error(`Duplicate agent stem: ${id}`)
      inventory[side].set(id, path)
    }
  }
  const ids = [...new Set([...inventory.claude.keys(), ...inventory.copilot.keys()])].sort()
  const aliases = agentAliases(ids)
  const oldBaseline = read('.agent-sync.json')
  const baseline = oldBaseline ? parseBaseline(oldBaseline) : { version: 2, pairs: {} }
  if (baseline.version !== 2) throw new Error('Legacy baseline requires explicit migration preflight; refusing to reset it')
  const writes = [], files = [], conflicts = [], missing = [], stale = []
  const pairs = {}
  function plan(target, content) {
    const previous = read(target)
    if (previous?.equals(content)) return
    ;(previous ? stale : missing).push(target)
    writes.push({ target, content, previous })
  }
  for (const id of Object.keys(baseline.pairs)) {
    if (!ids.includes(id)) conflicts.push(`Tracked pair removed or renamed: ${id}`)
  }
  for (const id of ids) {
    const paths = { claude: inventory.claude.get(id), copilot: inventory.copilot.get(id) }
    if (!paths.claude || !paths.copilot) {
      conflicts.push(`Explicit pair requires both client counterparts: ${id}`)
      continue
    }
    const translate = (body, source, target, side) => translateAgentLinks(body, { source, target, side, aliases, exists })
    try {
      const merged = mergeAgentPair(read(paths.claude), read(paths.copilot), baseline.pairs[id], id,
        (body, side) => translate(body, paths[side], paths.copilot, 'copilot'),
        (body, side) => translate(body, paths.copilot, paths[side], side))
      pairs[id] = merged.shared
      for (const side of ['claude', 'copilot']) {
        files.push({ source: paths[side], target: paths[side], content: merged[side] })
        plan(paths[side], merged[side])
      }
    } catch (error) { conflicts.push(error.message) }
  }
  const manifest = read('.claude-plugin/plugin.json')
  if (manifest) {
    const registered = JSON.parse(manifest).agents
    const targets = [...inventory.claude.values()].map((path) => `./${path}`).sort()
    if (!Array.isArray(registered) || JSON.stringify([...registered].sort()) !== JSON.stringify(targets)) {
      conflicts.push('Claude registration must enumerate native files exactly once')
    }
  }
  const hook = read('hooks/hooks.json')
  if (!hook) throw new Error('Missing hooks/hooks.json')
  for (const path of list('com.github.copilot/hooks', true)) {
    if (path !== 'com.github.copilot/hooks/hooks.json') extra.push(path)
  }
  files.push({ source: 'hooks/hooks.json', target: 'com.github.copilot/hooks/hooks.json', content: hook })
  plan('com.github.copilot/hooks/hooks.json', hook)
  const content = JSON.stringify({ version: 2, pairs }, null, 2) + '\n'
  // Preserve formatting of an otherwise identical baseline.
  const unchanged = Object.keys(baseline.pairs).length === Object.keys(pairs).length &&
    Object.entries(pairs).every(([id, pair]) => ['claude', 'copilot'].every((side) =>
      ['body', 'description'].every((field) => baseline.pairs[id]?.[side]?.[field] === pair[side][field])))
  plan('.agent-sync.json', oldBaseline && unchanged ? oldBaseline : Buffer.from(content))
  return { root, files, writes, removed: [], conflicts, missing: missing.sort(), stale: stale.sort(), extra: extra.sort() }
}