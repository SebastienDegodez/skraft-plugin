// Only body and the raw description field are shared. All other frontmatter,
// including name/tools/model/agents and comments, stays client-local verbatim.
// Description comparison is textual, not YAML-semantic (quoting changes count).
// New pairs require both client descriptors; no tool/model inference.
export function splitAgent(content) {
  const text = content.toString('utf8')
  const front = /^(?:\uFEFF)?---\r?\n([\s\S]*?)^---(?:\r?\n|$)/m.exec(text)
  if (!front || front.index !== 0) return { body: text, description: null, render: (shared) => {
    if (shared.description === null) return shared.body
    return `---\n${shared.description}---\n${shared.body}`
  } }
  const header = front[0]
  const fields = [...front[1].matchAll(/^[^\s#][^\r\n]*:[^\r\n]*(?:\r?\n|$)/gm)]
  const descriptions = fields.filter((field) => /^description:/.test(field[0]))
  if (descriptions.length > 1) throw new Error('Duplicate description field')
  const field = descriptions[0]
  const start = field ? header.indexOf(front[1]) + field.index : header.lastIndexOf('---')
  let end = start
  if (field) {
    end = start + field[0].length
    // Indented continuation lines belong to a multiline YAML description.
    const continuation = /^(?:(?:\r?\n)*[ \t]+[^\r\n]*(?:\r?\n|$))*/.exec(header.slice(end))[0]
    end += continuation.length
  }
  return {
    body: text.slice(header.length), description: field ? header.slice(start, end) : null,
    render: ({ body, description }) => header.slice(0, start) + (description ?? '') + header.slice(end) + body,
  }
}

export function mergeAgentPair(claude, copilot, baseline, pair, normalize, renderBody) {
  const parsed = { claude: splitAgent(claude), copilot: splitAgent(copilot) }
  const current = Object.fromEntries(Object.entries(parsed).map(([side, value]) => [side, {
    body: normalize(value.body, side), description: value.description,
  }]))
  const next = structuredClone(current)
  for (const field of ['body', 'description']) {
    const left = current.claude[field]
    const right = current.copilot[field]
    if (!baseline) {
      if (left !== right) throw new Error(`Baseline bootstrap requires equal shared ${field}: ${pair}`)
      continue
    }
    const leftChanged = left !== baseline.claude[field]
    const rightChanged = right !== baseline.copilot[field]
    if (leftChanged && rightChanged && left !== right) throw new Error(`Synchronization conflict (${field}): ${pair}`)
    if (leftChanged) next.copilot[field] = left
    if (rightChanged) next.claude[field] = right
  }
  return {
    shared: next,
    ...Object.fromEntries(Object.entries(parsed).map(([side, value]) => [side, Buffer.from(value.render({
      ...next[side], body: next[side].body === current[side].body ? value.body : renderBody(next[side].body, side),
    }))])),
  }
}

export function parseBaseline(content) {
  let state
  try { state = JSON.parse(content) } catch { throw new Error('Invalid agent-sync baseline JSON') }
  if (![1, 2].includes(state?.version) || !state.pairs || typeof state.pairs !== 'object' || Array.isArray(state.pairs)) {
    throw new Error('Unsupported agent-sync baseline version or shape')
  }
  for (const [path, shared] of Object.entries(state.pairs)) {
    if (state.version === 2) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path) || !shared ||
          Object.keys(shared).sort().join(',') !== 'claude,copilot' ||
          ['claude', 'copilot'].some((side) => !shared[side] || Object.keys(shared[side]).sort().join(',') !== 'body,description' ||
            typeof shared[side].body !== 'string' || !(shared[side].description === null || typeof shared[side].description === 'string'))) {
        throw new Error(`Invalid agent-sync baseline pair: ${path}`)
      }
      continue
    }
    if (!path.endsWith('.md') || path.split('/').some((part) => !part || part === '.' || part === '..') || path.includes('\\') ||
        !shared || typeof shared.body !== 'string' || !(shared.description === null || typeof shared.description === 'string')) {
      throw new Error(`Invalid agent-sync baseline pair: ${path}`)
    }
  }
  return state
}