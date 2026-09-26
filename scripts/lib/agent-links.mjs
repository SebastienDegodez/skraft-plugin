import { posix } from 'node:path'

export const claudeAgents = 'com.anthropic.claude-code/agents'
export const copilotAgents = 'com.github.copilot/agents'

// Preserve code spans, fenced examples, labels, titles and all non-destination prose.
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

export function translateAgentLinks(body, { source, target, aliases, side, exists }) {
  const edits = []
  const patterns = [
    /(!?\[(?:\\.|[^\]\\\r\n])*\]\([ \t]*)(<[^>\r\n]*>|(?:\\.|[^\s()\\]|\([^()\r\n]*\))+)(?=(?:[ \t]+["'][^\r\n]*["'])?[ \t]*\))/g,
    /(^ {0,3}\[(?:\\.|[^\]\\\r\n])+\]:[ \t]*)(<[^>\r\n]*>|\S+)/gm,
  ]
  for (const pattern of patterns) for (const match of proseMask(body).matchAll(pattern)) {
    const start = match.index + match[1].length
    const original = body.slice(start, start + match[2].length)
    const angled = original.startsWith('<')
    const destination = angled ? original.slice(1, -1) : original
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(destination) || /[{}]/.test(destination)) continue
    const split = destination.search(/[?#]/)
    const path = split < 0 ? destination : destination.slice(0, split)
    const suffix = split < 0 ? '' : destination.slice(split)
    const decoded = decodeURIComponent(path).replace(/\\([ ()])/g, '$1')
    let resolved = posix.normalize(posix.join(posix.dirname(source), decoded))
    if (posix.isAbsolute(decoded) || resolved === '..' || resolved.startsWith('../') || decoded.includes('\\')) {
      throw new Error(`Link escapes plugin root: ${destination}`)
    }
    const id = aliases.get(resolved)
    if (id) resolved = side === 'claude' ? `${claudeAgents}/${id}.md` : `${copilotAgents}/${id}.agent.md`
    else if (!exists(resolved)) throw new Error(`Unresolved bundled link: ${source}: ${destination}`)
    const value = posix.relative(posix.dirname(target), resolved).replaceAll(' ', '%20') + suffix
    edits.push({ start, end: start + original.length, value: angled ? `<${value}>` : value })
  }
  for (const edit of edits.sort((a, b) => b.start - a.start)) body = body.slice(0, edit.start) + edit.value + body.slice(edit.end)
  return body
}

export function agentAliases(ids) {
  return new Map(ids.flatMap((id) => [[`${claudeAgents}/${id}.md`, id], [`${copilotAgents}/${id}.agent.md`, id]]))
}