import { basename, posix } from 'node:path'
import { parseYaml } from '../../plugins/skraft-framework/src/domain/yaml-parser.mjs'
import { resolveModel } from '../../plugins/skraft-framework/src/application/resolve-model.mjs'

export const nativeAgents = 'com.anthropic.claude-code/agents'
const authoredAgents = 'com.github.copilot/agents'
const toolMap = new Map(Object.entries({
  'read/readFile': ['Read'], read: ['Read'],
  'search/codebase': ['Grep', 'Glob'], 'search/textSearch': ['Grep'], 'search/usages': ['Grep'],
  'search/fileSearch': ['Glob'], 'search/listDirectory': ['Glob'],
  'edit/createFile': ['Write'], 'edit/editFiles': ['Edit'], 'edit/createDirectory': [], edit: ['Write', 'Edit'],
  'execute/runInTerminal': ['Bash'], 'execute/getTerminalOutput': ['TaskOutput'], 'execute/killTerminal': ['TaskStop'],
  'execute/sendToTerminal': [], 'execute/testFailure': [], execute: ['Bash', 'TaskOutput', 'TaskStop'],
  'graphify/*': ['mcp__graphify__*'],
}))

function string(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing or invalid ${field}`)
  return value
}

function strings(value, field) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`Missing or invalid ${field} list`)
  }
  return value
}

// Parse semantics with the shared YAML reader; retain spans rather than serialize metadata/body.
function parseDescriptor(content, source) {
  const text = content.toString('utf8')
  const front = /^(?:\uFEFF)?---\r?\n([\s\S]*?)^---(?:\r?\n|$)/m.exec(text)
  if (!front || front.index !== 0) throw new Error('Missing descriptor frontmatter')
  const fields = new Map()
  const block = front[1]
  const offset = front[0].indexOf(block)
  for (const match of block.matchAll(/^([A-Za-z_][\w-]*):[^\r\n]*(?:\r?\n|$)/gm)) {
    const key = match[1]
    if (fields.has(key)) throw new Error(`Duplicate field: ${key}`)
    const start = offset + match.index
    const rest = block.slice(match.index + match[0].length)
    const continuation = /^(?:(?:\r?\n)*[ \t]+[^\r\n]*(?:\r?\n|$))*/.exec(rest)[0]
    fields.set(key, { start, end: start + match[0].length + continuation.length })
  }
  const metadata = fields.get('metadata')
  if (metadata) {
    const seen = new Set()
    for (const match of text.slice(metadata.start, metadata.end).matchAll(/^  ([\w-]+):/gm)) {
      if (seen.has(match[1])) throw new Error(`Duplicate metadata field: ${match[1]}`)
      seen.add(match[1])
    }
  }
  const data = parseYaml(block)
  const id = basename(source).replace(/(?:\.agent)?\.md$/, '')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error(`Invalid native agent ID: ${id}`)
  string(data.name, 'name')
  string(data.description, 'description')
  string(data.model, 'model scalar')
  strings(data.tools, 'tools')
  if (data.agents !== undefined) strings(data.agents, 'agents')
  return { source, id, data, text, fields, body: text.slice(front[0].length), header: front[0] }
}

function nativeModel({ id, data }) {
  const costRoleClass = string(data.metadata?.cost_role_class, 'metadata.cost_role_class')
  const modelRequirement = data.metadata?.model_requirement
  if (modelRequirement !== undefined && (typeof modelRequirement !== 'string' || !/^Sonnet-class or above\b/i.test(modelRequirement))) {
    throw new Error(`Unsupported model_requirement: ${modelRequirement}`)
  }
  const { tier, accepted } = resolveModel({ costRoleClass, modelRequirement })
  if (id === 'skraft-orchestrator' && data.model === 'inherit') return 'inherit'
  if (!accepted.includes(data.model)) throw new Error(`Source model '${data.model}' does not match ${tier} policy`)
  const model = { economy: 'haiku', standard: 'sonnet', frontier: 'opus' }[tier]
  if (!model) throw new Error(`Unknown native model tier: ${tier}`)
  return model
}

function nativeTools(data, identities) {
  const children = data.agents?.map((ref) => {
    const child = identities.get(ref)
    if (!child) throw new Error(`Unknown child agent: ${ref}`)
    return child.id
  })
  if (children && (!children.length || !data.tools.includes('agent'))) {
    throw new Error('Child agents require agent capability and a nonempty restriction')
  }
  const result = [...new Set(data.tools.flatMap((tool) => {
    if (tool === 'agent') return [children ? `Agent(${[...new Set(children)].join(', ')})` : 'Agent']
    if (!toolMap.has(tool)) throw new Error(`Unknown native tool mapping: ${tool}`)
    return toolMap.get(tool)
  }))]
  // Non-equivalences never justify widening the declared capability boundary.
  if (data.tools.includes('execute/sendToTerminal') && !result.includes('Bash')) {
    throw new Error('execute/sendToTerminal requires an already granted Bash capability; interactive stdin is not translated')
  }
  if (data.tools.includes('execute/testFailure') && !result.includes('Bash') && !result.includes('Read')) {
    throw new Error('execute/testFailure requires existing Bash or Read capability')
  }
  if (data.tools.includes('edit/createDirectory') && !result.includes('Write')) {
    throw new Error('edit/createDirectory requires existing Write capability; empty directories are not translated')
  }
  return result
}

function bundledPath(path) {
  const normalized = posix.normalize(path)
  if (posix.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../') || normalized.includes('\\')) {
    throw new Error(`Link escapes plugin root: ${path}`)
  }
  return normalized
}

// Mask code without changing offsets. Only Markdown destinations are edited below.
function proseMask(body) {
  let fence
  let masked = body.replace(/[^\n]*(?:\n|$)/g, (line) => {
    const marker = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)/.exec(line)
    const hidden = Boolean(fence || marker || /^(?: {4}|\t)/.test(line))
    if (marker) {
      if (!fence) fence = marker[1]
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined
    }
    return hidden ? line.replace(/[^\r\n]/g, ' ') : line
  })
  masked = masked.replace(/(`+)([\s\S]*?)\1(?!`)/g, (code) => code.replace(/[^\r\n]/g, ' '))
  return masked
}

function rewriteLinks(descriptor, bySource, exists) {
  const { body, source, id } = descriptor
  const target = `${nativeAgents}/${id}.md`
  const mask = proseMask(body)
  const edits = []
  const patterns = [
    /(!?\[(?:\\.|[^\]\\\r\n])*\]\([ \t]*)(<[^>\r\n]*>|(?:\\.|[^\s()\\]|\([^()\r\n]*\))+)(?=(?:[ \t]+["'][^\r\n]*["'])?[ \t]*\))/g,
    /(^ {0,3}\[(?:\\.|[^\]\\\r\n])+\]:[ \t]*)(<[^>\r\n]*>|\S+)/gm,
  ]
  for (const pattern of patterns) for (const match of mask.matchAll(pattern)) {
    const start = match.index + match[1].length
    const original = body.slice(start, start + match[2].length)
    const angled = original.startsWith('<')
    const destination = angled ? original.slice(1, -1) : original
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(destination) || /[{}]/.test(destination)) continue
    const split = destination.search(/[?#]/)
    const path = split < 0 ? destination : destination.slice(0, split)
    const suffix = split < 0 ? '' : destination.slice(split)
    const decoded = decodeURIComponent(path).replace(/\\([ ()])/g, '$1')
    if (posix.isAbsolute(decoded) || decoded.includes('\\')) throw new Error(`Link escapes plugin root: ${destination}`)
    let resolved = bundledPath(posix.join(posix.dirname(source), decoded))
    let linkedAgent = bySource.get(resolved)
    if (!linkedAgent && resolved.endsWith('.agent.md')) linkedAgent = bySource.get(resolved.replace(/\.agent\.md$/, '.md'))
    if (linkedAgent) resolved = `${nativeAgents}/${linkedAgent.id}.md`
    else if (!exists(resolved)) {
      const depth = posix.relative(authoredAgents, posix.dirname(source)).split('/').filter(Boolean).length
      const legacy = `${'../'.repeat(depth + 1)}skills/`
      if (decoded.startsWith(legacy)) resolved = bundledPath(`skills/${decoded.slice(legacy.length)}`)
      if (!exists(resolved)) throw new Error(`Unresolved bundled link: ${destination}`)
    }
    const rewritten = posix.relative(posix.dirname(target), resolved).replaceAll(' ', '%20') + suffix
    edits.push({ start, end: start + original.length, value: angled ? `<${rewritten}>` : rewritten })
  }
  let result = body
  for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.value + result.slice(edit.end)
  return result
}

/** Pure projection except for the injected, containment-checked bundled-file lookup. */
export function projectNativeClaudeAgents(sources, { exists }) {
  const descriptors = sources.map(({ source, content }) => {
    try { return parseDescriptor(content, source) } catch (error) { throw new Error(`${source}: ${error.message}`) }
  })
  const identities = new Map()
  const bySource = new Map(descriptors.map((descriptor) => [descriptor.source, descriptor]))
  for (const descriptor of descriptors) for (const name of new Set([descriptor.id, descriptor.data.name])) {
    if (identities.has(name)) throw new Error(`Duplicate or ambiguous agent name: ${name}`)
    identities.set(name, descriptor)
  }
  return descriptors.map((descriptor) => {
    try {
      const eol = descriptor.header.includes('\r\n') ? '\r\n' : '\n'
      const tools = nativeTools(descriptor.data, identities)
      const values = {
        name: descriptor.id,
        model: nativeModel(descriptor),
        tools: tools.length ? `${eol}${tools.map((tool) => `  - ${tool}${eol}`).join('')}` : ' []',
      }
      let header = descriptor.header
      const edits = Object.entries(values).map(([key, value]) => {
        const span = descriptor.fields.get(key)
        const line = key === 'tools' ? `tools:${value}${tools.length ? '' : eol}` : `${key}: ${value}${eol}`
        return { ...span, line }
      }).sort((a, b) => b.start - a.start)
      for (const { start, end, line } of edits) header = header.slice(0, start) + line + header.slice(end)
      return { source: descriptor.source, target: `${nativeAgents}/${descriptor.id}.md`,
        content: Buffer.from(header + rewriteLinks(descriptor, bySource, exists)) }
    } catch (error) { throw new Error(`${descriptor.source}: ${error.message}`) }
  })
}