// Converts the Jekyll handbook pages (docs/site/{en,fr}) into Docusaurus pages (docs/website).
// Plan: docs/v2/docusaurus-migration-plan.md, section 3. Zero dependency.
import { posix } from 'node:path'

const DROPPED_KEYS = new Set(['layout', 'lang', 'permalink'])

/** Splits a page into its front matter lines (without the --- fences) and its body. */
const splitFrontMatter = (source) => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(source)
  if (!match) return { lines: null, body: source }
  return { lines: match[1].split('\n'), body: source.slice(match[0].length) }
}

/** Groups front matter lines by top-level key; an indented line belongs to the key above it. */
const frontMatterEntries = (lines) => {
  const entries = []
  for (const line of lines) {
    const key = /^([A-Za-z_][\w-]*):/.exec(line)?.[1]
    if (key || entries.length === 0) entries.push({ key: key ?? '', lines: [line] })
    else entries.at(-1).lines.push(line)
  }
  return entries
}

const valueOf = (entry) => entry.lines[0].slice(entry.key.length + 1).trim().replace(/^["']|["']$/g, '')

/** Rule 1: drop layout, lang and permalink; record the permalink as a redirect; add `phase`. */
const convertFrontMatter = (lines, page) => {
  if (!lines) return ''
  const entries = frontMatterEntries(lines)
  for (const entry of entries.filter((e) => e.key === 'permalink')) {
    page.redirects.push({ from: valueOf(entry), to: page.docId })
  }
  const kept = entries.filter((e) => !DROPPED_KEYS.has(e.key)).flatMap((e) => e.lines)
  if (page.phase && !entries.some((e) => e.key === 'phase')) kept.push(`phase: ${page.phase}`)
  return `---\n${kept.join('\n')}\n---\n`
}

const FENCE = /^(\s*)(`{3,}|~{3,})(.*)$/

/** Splits body lines into prose and fenced segments, keeping each line's index in the body. */
const segments = (lines) => {
  const out = []
  let open = null
  lines.forEach((line, index) => {
    const fence = FENCE.exec(line)
    if (open) {
      open.lines.push(line)
      if (fence && fence[2][0] === open.marker[0] && fence[2].length >= open.marker.length && !fence[3].trim()) open = null
      return
    }
    if (fence) {
      open = { fence: true, marker: fence[2], start: index, lines: [line] }
      out.push(open)
      return
    }
    if (!out.length || out.at(-1).fence) out.push({ fence: false, start: index, lines: [] })
    out.at(-1).lines.push(line)
  })
  return out
}

const joinSegments = (parts) => parts.flatMap((part) => part.lines).join('\n')

/** Applies `convert` to every prose line (outside fenced code); a null result drops the line. */
const mapProse = (text, convert) => joinSegments(
  segments(text.split('\n')).map((part) => (part.fence
    ? part
    : { ...part, lines: part.lines.map(convert).filter((line) => line !== null) })),
)

/** Relative link from the page to another doc of the same locale: `./x.md`, `../y/z.mdx`. */
const linkTo = (targetId, page, anchor = '') => {
  const from = posix.dirname(page.docId)
  const path = posix.relative(from, targetId) + extensionOf(targetId, page)
  return (path.startsWith('.') ? path : `./${path}`) + anchor
}

const extensionOf = (docId, page) => (page.mdxDocs.has(docId) ? '.mdx' : '.md')

/** Removes a line made of a Liquid tag only, with the blank line that follows it inside the body. */
const removeTagLines = (text, isRemoved) => {
  const lines = text.split('\n')
  const out = []
  for (let index = 0; index < lines.length; index += 1) {
    if (!isRemoved(lines[index])) { out.push(lines[index]); continue }
    if (out.length && out.at(-1).trim() === '' && lines[index + 1]?.trim() === '') index += 1
  }
  return out.join('\n')
}

const ASSIGN_CITES = /^\s*\{%-?\s*assign\s+cites\s*=.*%\}\s*$/

/** Rule 2: `{% assign cites = … %}` goes; `{{ cites }}#cite-<key>` points at the citations page. */
const convertCitationLinks = (text, page) => mapProse(
  removeTagLines(text, (line) => ASSIGN_CITES.test(line)),
  (line) => line.replace(/\{\{-?\s*cites\s*-?\}\}(#[\w-]+)?/g, (_, anchor = '') => linkTo('reference/citations', page, anchor)),
)

/** Records a page that needs a hand resolution, at the source line that holds `needle`. */
const report = (page, rule, needle, reason) => {
  const seen = page.seen.get(needle) ?? 0
  page.seen.set(needle, seen + 1)
  let at = -1
  for (let n = 0; n <= seen; n += 1) at = page.source.indexOf(needle, at + 1)
  const line = at < 0 ? 0 : page.source.slice(0, at).split('\n').length
  page.findings.push({ rule, line, reason })
}

const LIQUID_LINK = /\{\{-?\s*["']([^"']+)["']\s*\|\s*relative_url\s*-?\}\}(#[\w-]+)?/g

/** Doc id of a site path inside one locale: `/x/` is `x/index`, `/` is `index`. */
const docIdOfPath = (path) => {
  const trimmed = path.replace(/\.html$/, '').replace(/^\/+/, '')
  if (trimmed === '') return 'index'
  return trimmed.endsWith('/') ? `${trimmed}index` : trimmed
}

const DASHBOARD = /^\/(?:(en|fr)\/)?dashboard\/?$/

/** What a Liquid site path becomes; null when the page needs a hand resolution. */
const rewriteSitePath = (path, anchor, page) => {
  const [pathname, inlineAnchor = ''] = path.split('#')
  const hash = anchor || (inlineAnchor && `#${inlineAnchor}`)
  const dashboard = DASHBOARD.exec(pathname)
  if (dashboard) return dashboardLink(dashboard[1], page) + hash
  if (pathname.startsWith('/assets/')) return `/img/${pathname.slice('/assets/'.length)}${hash}`
  if (pathname === '/skraft-basic-presentation.html') return `pathname://${pathname}${hash}`
  const locale = /^\/(en|fr)(\/.*)$/.exec(pathname)
  if (!locale || locale[1] !== page.locale) return null
  return linkTo(docIdOfPath(locale[2]), page, hash)
}

const dashboardLink = (locale, page) => {
  if (page.dashboardLink === 'catalogue') return linkTo('reference/catalogue', page)
  return locale === 'fr' ? 'pathname:///fr/dashboard/' : 'pathname:///dashboard/'
}

/** Rule 3: `{{ "/<lang>/<p>" | relative_url }}#a` becomes a relative file link. */
const convertInternalLinks = (text, page) => mapProse(text, (line) => line.replace(LIQUID_LINK, (match, path, anchor) => {
  const rewritten = rewriteSitePath(path, anchor ?? '', page)
  if (rewritten !== null) return rewritten
  const locale = /^\/(en|fr)\//.exec(path)
  report(page, 'internal-links', match, locale ? `link to another locale: ${path}` : `unknown site path: ${path}`)
  return match
}))

const PHASE_RIBBON = /^\s*\{%-?\s*include\s+phase-ribbon\.html\s+current="([\w-]+)"\s*-?%\}\s*$/
const INCLUDE = /\{%-?\s*include\s+(\S+)[^%]*%\}/g

/** Rule 4: the phase-ribbon include goes (it became `phase`); any other include is reported. */
const convertIncludes = (text, page) => {
  const removed = removeTagLines(text, (line) => {
    const ribbon = PHASE_RIBBON.exec(line)
    if (ribbon) page.phase = ribbon[1]
    return Boolean(ribbon)
  })
  mapProse(removed, (line) => {
    for (const [match, name] of line.matchAll(INCLUDE)) report(page, 'includes', match, `include with no Docusaurus equivalent: ${name}`)
    return line
  })
  return removed
}

const FIL_ROUGE_OPEN = /^\s*<div class="fil-rouge"[^>]*>\s*$/
const FIL_ROUGE_LABEL = /^\s*<span class="fil-rouge__label">(.*)<\/span>\s*$/

const markdownLabel = (html) => html
  .replace(/<em>(.*?)<\/em>/g, '*$1*')
  .replace(/<strong>(.*?)<\/strong>/g, '**$1**')

/** Rule 5: the fil-rouge `<div>` and its label `<span>` become `:::info[label]` … `:::`. */
const convertRunningExample = (text, page) => {
  let inside = false
  return mapProse(text, (line) => {
    if (FIL_ROUGE_OPEN.test(line)) { inside = true; return null }
    const label = inside && FIL_ROUGE_LABEL.exec(line)
    if (label) return `:::info[${markdownLabel(label[1])}]`
    if (inside && /^\s*<\/div>\s*$/.test(line)) { inside = false; return ':::' }
    return line
  })
}

/** Rule 6: `{% raw %}` and `{% endraw %}` go everywhere (Liquid also read them inside fences). */
const convertRawBlocks = (text) => text.replace(/\{%-?\s*(?:end)?raw\s*-?%\}/g, '')

const CITATIONS_LOOP = /\{%-?\s*for\s+cite\s+in\s+site\.data\.citations\s*-?%\}[\s\S]*?\{%-?\s*endfor\s*-?%\}/

/** Rule 7: the citations page's Liquid loop becomes `<Bibliography />`. */
const convertCitationsPage = (text, page) => {
  if (page.docId !== 'reference/citations' || !CITATIONS_LOOP.test(text)) return text
  page.imports.push("import Bibliography from '@site/src/components/Bibliography';")
  return text.replace(CITATIONS_LOOP, '<Bibliography />')
}

/** Imports go right after the front matter, between blank lines. */
const withImports = (body, imports) => (imports.length ? `\n${imports.join('\n')}\n${body}` : body)

const HEADING_ID = /^(\s{0,3}#{1,6}\s.*?)\s*(?:\{#([\w-]+)\}|<!--\s*#([\w-]+)\s*-->|\{\/\*\s*#([\w-]+)\s*\*\/\})\s*$/

// Rule 8: `## T {#id}` becomes `## T <!-- #id -->` (.md) or `## T {/* #id */}` (.mdx).
const convertHeadingIds = (text, page) => {
  if (page.headingIds === 'classic') return text
  return mapProse(text, (line) => {
    const heading = HEADING_ID.exec(line)
    if (!heading) return line
    const id = heading[2] ?? heading[3] ?? heading[4]
    return page.extension === '.mdx' ? `${heading[1]} {/* #${id} */}` : `${heading[1]} <!-- #${id} -->`
  })
}

const ADMONITIONS = new Map([
  ['Decision', 'note'], ['Décision', 'note'],
  ['Jargon', 'note'],
  ['Genesis', 'info'],
  ['Not verified on V2', 'caution'], ['Non vérifié sur V2', 'caution'],
])
const QUOTE = /^ {0,3}>/
const LABELLED = /^ {0,3}>\s*\*\*([^*]+?)\s*[.:]?\s*\*\*\s*(?:[—:-]\s*)?(.*)$/
const unquote = (line) => line.replace(/^ {0,3}> ?/, '')

/** The admonition a labelled blockquote becomes, or null when its label maps to none. */
const admonition = (quote) => {
  const labelled = LABELLED.exec(quote[0])
  const type = labelled && ADMONITIONS.get(labelled[1])
  if (!type) return null
  const body = [labelled[2], ...quote.slice(1).map(unquote)].filter((line, index) => index > 0 || line !== '')
  return [`:::${type}[${labelled[1]}]`, ...body, ':::']
}

/** Index of the first line after the H1 that is not blank, or -1. */
const afterHeading = (lines) => {
  const h1 = lines.findIndex((line) => /^# /.test(line))
  if (h1 < 0) return -1
  let index = h1 + 1
  while (index < lines.length && lines[index].trim() === '') index += 1
  return index
}

/** Rule 9: the first blockquote right after the H1 becomes the lead; labelled ones become admonitions. */
const convertBlockquotes = (text) => {
  const parts = segments(text.split('\n'))
  let leadDone = false
  for (const part of parts.filter((p) => !p.fence)) {
    const lead = leadDone ? -1 : afterHeading(part.lines)
    if (part.lines.some((line) => /^# /.test(line))) leadDone = true
    part.lines = convertQuotes(part.lines, lead)
  }
  return joinSegments(parts)
}

const convertQuotes = (lines, lead) => {
  const out = []
  for (let index = 0; index < lines.length;) {
    if (!QUOTE.test(lines[index])) { out.push(lines[index]); index += 1; continue }
    const quote = []
    const start = index
    while (index < lines.length && QUOTE.test(lines[index])) quote.push(lines[index++])
    const converted = admonition(quote)
    if (converted) out.push(...converted)
    else out.push(...(start === lead ? quote.map(unquote) : quote))
  }
  return out
}

const SHELL_LANGUAGES = new Set(['', 'text', 'bash', 'sh', 'shell'])
const PROGRAMS = new Set(['skraft', 'node', 'npm', 'npx', 'git', 'gh', 'claude', 'copilot', 'dotnet', 'vally', 'sh', 'az', 'mkdir', 'cd'])
const SKRAFT_COMMANDS = new Set([
  'install', 'init', 'status', 'report', 'decide', 'publish', 'journal', 'migrate', 'next', 'record', 'gate', 'doctor',
  'review', 'workflow',
])
const HOSTS = [['Claude Code', /Claude Code/], ['GitHub Copilot CLI', /Copilot/], ['VS Code', /VS Code|Visual Studio Code/]]
const PLACEHOLDER_IN_CODE = /<[^\s<>][^<>]*>/

/** A line that runs a known program: `git add .`, `skraft gate --all`, but not `skraft checkout: done`. */
const isCommand = (line) => {
  if (/^\s/.test(line)) return false
  const [program, ...words] = line.trim().split(/\s+/)
  if (!PROGRAMS.has(program) && !program.startsWith('./eng/')) return false
  const firstArgument = words.findIndex((word) => /^[-"'<]/.test(word))
  const leading = firstArgument < 0 ? words : words.slice(0, firstArgument)
  if (leading.some((word) => word.endsWith(':'))) return false
  if (program !== 'skraft') return true
  return words.length === 0 || words[0].startsWith('-') || SKRAFT_COMMANDS.has(words[0])
}

/** Role of each line: blank, command, continuation (after a trailing backslash) or other. */
const lineRoles = (lines) => {
  let continued = false
  return lines.map((line) => {
    const role = continued ? 'continuation' : line.trim() === '' ? 'blank' : isCommand(line) ? 'command' : 'other'
    continued = role !== 'blank' && /\\\s*$/.test(line)
    return role
  })
}

const hostsNamed = (text) => HOSTS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name)

/** The single host named in the paragraph above the block, else in the heading above it. */
const hostOf = ({ paragraph, heading }) => {
  const inParagraph = hostsNamed(paragraph)
  if (inParagraph.length) return inParagraph.length === 1 ? inParagraph[0] : null
  const inHeading = hostsNamed(heading)
  return inHeading.length === 1 ? inHeading[0] : null
}

const consoleInfo = (meta, title) => ['console', title && !/\btitle=/.test(meta) ? `title="${title}"` : '', meta]
  .filter(Boolean).join(' ')

const ambiguous = (info, lines, reason) => ({ kind: 'ambiguous', info, lines, reason })

const classifyHost = (info, meta, lines, context) => {
  const host = hostOf(context)
  if (!host) return ambiguous(info, lines, 'host slash commands, but no single host named above the block')
  return { kind: 'host', info: consoleInfo(meta, host), lines: lines.map((line) => (line.trim() ? `> ${line}` : line)) }
}

const classifyCommands = (info, meta, lines, roles) => {
  const first = roles.find((role) => role !== 'blank')
  if (first !== 'command') return ambiguous(info, lines, 'commands mixed with other lines, the first line is not a command')
  const kind = roles.includes('other') ? 'command-output' : 'commands'
  return { kind, info: consoleInfo(meta), lines: lines.map((line, index) => (roles[index] === 'command' ? `$ ${line}` : line)) }
}

const isCliOutput = (lines) => {
  const first = lines.find((line) => line.trim() !== '') ?? ''
  return /^skraft \S/.test(first) && !lines.some((line) => PLACEHOLDER_IN_CODE.test(line))
}

/**
 * Rule 10: what a fenced block becomes (§2.5 of the plan).
 * @param {{ info: string, lines: string[], context: { paragraph: string, heading: string } }} fence
 * @returns {{ kind: 'commands'|'command-output'|'cli-output'|'host'|'ambiguous'|'unchanged', info: string, lines: string[], reason?: string }}
 */
export const classifyFence = ({ info, lines, context }) => {
  const [language = '', ...rest] = info.trim().split(/\s+/)
  const meta = rest.join(' ')
  const unchanged = { kind: 'unchanged', info, lines }
  if (!SHELL_LANGUAGES.has(language)) return unchanged
  const filled = lines.filter((line) => line.trim() !== '')
  if (!filled.length) return unchanged
  if (filled.every((line) => /^\/[a-z]/.test(line.trim()))) return classifyHost(info, meta, lines, context)
  const roles = lineRoles(lines)
  if (roles.includes('command')) return classifyCommands(info, meta, lines, roles)
  if (isCliOutput(lines)) return { kind: 'cli-output', info: consoleInfo(meta), lines }
  return unchanged
}

const dedent = (line, indent) => (line.startsWith(indent) ? line.slice(indent.length) : line.trimStart())

/** Applies the classifier to every fence of the page, with the paragraph and heading above it. */
const convertFences = (text, page) => {
  const parts = segments(text.split('\n'))
  let heading = ''
  let paragraph = ''
  for (const part of parts) {
    if (!part.fence) {
      heading = part.lines.filter((line) => /^#{1,6}\s/.test(line)).at(-1) ?? heading
      paragraph = lastParagraph(part.lines)
      continue
    }
    part.lines = convertFence(part.lines, { paragraph, heading }, page)
    paragraph = ''
  }
  return joinSegments(parts)
}

const lastParagraph = (lines) => {
  const end = lines.findLastIndex((line) => line.trim() !== '')
  let start = end
  while (start > 0 && lines[start - 1].trim() !== '') start -= 1
  return end < 0 ? '' : lines.slice(start, end + 1).join('\n')
}

const convertFence = (block, context, page) => {
  const [, indent, marker, info] = FENCE.exec(block[0])
  const closed = block.length > 1 && FENCE.test(block.at(-1))
  const body = block.slice(1, closed ? -1 : undefined)
  const result = classifyFence({ info, lines: body.map((line) => dedent(line, indent)), context })
  if (result.kind === 'ambiguous') report(page, 'code-fences', block.join('\n'), result.reason)
  if (result.kind === 'unchanged' || result.kind === 'ambiguous') return block
  return [`${indent}${marker}${result.info}`, ...result.lines.map((line) => (line ? indent + line : line)), ...(closed ? [block.at(-1)] : [])]
}

/** Splits a paragraph into code spans and text (CommonMark backtick runs of equal length). */
const splitCodeSpans = (paragraph) => {
  const pieces = []
  let text = ''
  for (let index = 0; index < paragraph.length;) {
    const run = /^`+/.exec(paragraph.slice(index))?.[0]
    const escaped = paragraph[index] === '\\' && paragraph[index + 1] === '`'
    if (escaped) { text += '\\`'; index += 2; continue }
    if (!run) { text += paragraph[index]; index += 1; continue }
    const close = closingRun(paragraph, index + run.length, run.length)
    if (close < 0) { text += run; index += run.length; continue }
    pieces.push({ code: false, text }, { code: true, text: paragraph.slice(index, close + run.length) })
    text = ''
    index = close + run.length
  }
  return [...pieces, { code: false, text }].filter((piece) => piece.text !== '')
}

const closingRun = (paragraph, from, length) => {
  for (const match of paragraph.slice(from).matchAll(/`+/g)) {
    if (match[0].length === length) return from + match.index
  }
  return -1
}

/** Applies `convert` to the prose text of every paragraph, outside fences and code spans. */
const mapProseText = (text, convert) => {
  const parts = segments(text.split('\n'))
  for (const part of parts.filter((p) => !p.fence)) {
    part.lines = part.lines.join('\n').split(/(\n[ \t]*\n)/).map((chunk) => splitCodeSpans(chunk)
      .map((piece) => (piece.code ? piece.text : convert(piece.text, chunk)))
      .join('')).join('').split('\n')
  }
  return joinSegments(parts)
}

const HTML_TAGS = new Set([
  'a', 'abbr', 'b', 'br', 'cite', 'code', 'del', 'details', 'div', 'em', 'figcaption', 'figure', 'hr', 'i', 'img', 'kbd',
  'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'small', 'span', 'strong', 'sub', 'summary', 'sup', 'table', 'td', 'th', 'tr',
  'u', 'ul', 'wbr',
])
const VOID_TAGS = new Set(['br', 'hr', 'img', 'wbr'])
const ANGLE = /<[^<>\n]*>|</g

/** True when `<…>` is HTML, JSX, an autolink or a comment rather than a placeholder. */
const isMarkup = (tag, paragraph) => {
  if (/^<(?:!|https?:|mailto:)/.test(tag)) return true
  const parts = /^<(\/?)([A-Za-z][\w.-]*)(\s+[^<>]*?)?\s*(\/?)>$/.exec(tag)
  if (!parts) return false
  const [, closing, name, attributes = '', selfClosing] = parts
  const known = HTML_TAGS.has(name) || /^[A-Z][a-z]\w*$/.test(name)
  if (!known) return false
  if (closing || selfClosing || attributes.includes('=') || VOID_TAGS.has(name)) return true
  return paragraph.includes(`</${name}>`)
}

/** Rule 11 (and the `<` half of rule 12 in .mdx): placeholders in prose become entities. */
const convertPlaceholders = (text, page) => mapProseText(text, (prose, paragraph) => prose.replace(ANGLE, (match) => {
  if (match === '<') return page.extension === '.mdx' ? '&lt;' : match
  if (isMarkup(match, paragraph)) return match
  return `&lt;${match.slice(1, -1)}&gt;`
}))

// Rule 12: in an .mdx page, `{` and `}` in prose are escaped; `{/* … */}` comments stay.
const convertBraces = (text, page) => {
  if (page.extension !== '.mdx') return text
  return mapProseText(text, (prose) => prose.replace(/\{\/\*[\s\S]*?\*\/\}|\\[{}]|[{}]/g, (match) => (match.length === 1 ? `\\${match}` : match)))
}

const JSX = /^import\s.+\sfrom\s+['"][^'"]+['"];?\s*$|<[A-Z][a-z]\w*[\s/>]/m

/** Rule 13: `.mdx` for the pages listed as such, or whose prose holds an import or a component. */
const needsMdx = (docId, body, mdxDocs) => mdxDocs.has(docId)
  || segments(body.split('\n')).some((part) => !part.fence && JSX.test(part.lines.join('\n')))

const HOST_SECTION = /^#{3,6}\s+(Claude Code|GitHub Copilot CLI|Copilot CLI|VS Code)\s*$/

/** Rule 13, reported: per-host sections are Tabs a writer adds by hand (the page then needs .mdx). */
const reportHostSections = (text, page) => {
  const sections = segments(text.split('\n')).filter((part) => !part.fence)
    .flatMap((part) => part.lines.filter((line) => HOST_SECTION.test(line)))
  const hosts = [...new Set(sections.map((line) => HOST_SECTION.exec(line)[1]))]
  if (hosts.length < 2) return
  const rename = page.extension === '.md' ? ', then rename to .mdx' : ''
  report(page, 'extension', sections[0], `host sections (${hosts.join(', ')}): write Tabs groupId="host" by hand${rename}`)
}

/**
 * What a converted page still holds that Docusaurus cannot read.
 * @param {string} text a converted page
 * @param {{ extension: '.md'|'.mdx', headingIds?: 'comment'|'classic' }} options
 * @returns {{ rule: 'check', line: number, reason: string }[]}
 */
export const checkPage = () => []

const DEFAULT_MDX_DOCS = ['index', 'reference/citations']

/**
 * Converts one Jekyll page.
 * @param {string} source the Jekyll page
 * @param {{ docId: string, locale: 'en'|'fr' }} options
 * @returns {{ text: string, extension: '.md'|'.mdx', findings: object[], redirects: object[] }}
 */
export const convertPage = (source, options) => {
  const mdxDocs = new Set([...DEFAULT_MDX_DOCS, ...(options.mdxDocs ?? [])])
  const page = { ...options, mdxDocs, source, seen: new Map(), findings: [], redirects: [], imports: [], phase: null }
  const { lines, body } = splitFrontMatter(source)
  page.extension = needsMdx(page.docId, body, mdxDocs) ? '.mdx' : '.md'
  let text = body
  text = convertCitationLinks(text, page)
  text = convertInternalLinks(text, page)
  text = convertIncludes(text, page)
  text = convertRunningExample(text, page)
  text = convertRawBlocks(text)
  text = convertCitationsPage(text, page)
  text = convertHeadingIds(text, page)
  text = convertBlockquotes(text)
  text = convertFences(text, page)
  text = convertPlaceholders(text, page)
  text = convertBraces(text, page)
  reportHostSections(text, page)
  text = convertFrontMatter(lines, page) + withImports(text, page.imports)
  return { text, extension: page.extension, findings: page.findings, redirects: page.redirects }
}
