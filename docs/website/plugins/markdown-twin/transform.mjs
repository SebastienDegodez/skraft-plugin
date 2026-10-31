import { posix } from 'node:path'

// Pure: turns the source of a doc page into its Markdown twin, the text an AI agent reads.
// Line-based on the handbook's controlled syntax (no parser): front matter, MDX imports,
// admonitions, Tabs, <WorkflowViewer/>, <Bibliography/>, links and images. Fenced code is copied
// as written.

const ADMONITIONS = {
  en: { note: 'Note', tip: 'Tip', info: 'Info', warning: 'Warning', danger: 'Danger', caution: 'Caution' },
  fr: { note: 'Remarque', tip: 'Astuce', info: 'Info', warning: 'Attention', danger: 'Danger', caution: 'Prudence' },
}
const DOT_SOURCE = { en: 'DOT source', fr: 'source DOT' }

const ofLocale = (table, locale) => table[locale] ?? table.en

const stripFrontMatter = (lines) => {
  if (lines[0]?.trim() !== '---') return lines
  const end = lines.indexOf('---', 1)
  return end === -1 ? lines : lines.slice(end + 1)
}

// The twin a doc would get by convention, for a link to a doc not built (yet): a folder's index
// doc is served at the folder's path, the home of the version at index.md.
const conventionalTwin = (versionPath, target) => {
  const slug = target.replace(/\.mdx?$/, '').replace(/(^|\/)index$/, '')
  const root = versionPath.replace(/\/?$/, '/')
  return slug === '' ? `${root}index.md` : `${root}${slug}.md`
}

const docTwinUrl = (target, page) => {
  const [path, anchor] = target.split('#')
  const resolved = posix.join(posix.dirname(page.docPath), path)
  const twin = page.twins.get(resolved) ?? conventionalTwin(page.versionPath, resolved)
  return `${page.siteUrl}${twin}${anchor === undefined ? '' : `#${anchor}`}`
}

const isExternal = (target) => /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')

const rewriteTarget = (target, isImage, page) => {
  if (isExternal(target)) return target
  if (target.startsWith('/')) return `${page.siteUrl}${page.baseUrl}${target.slice(1)}`
  if (!isImage && /\.mdx?(#|$)/.test(target)) return docTwinUrl(target, page)
  if (!isImage) return target
  return `${page.rawRepo}${posix.join(posix.dirname(page.sourceRepoPath), target)}`
}

const LINK = /(!?)\[([^\]]*)\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g

// Rewrites links and images outside inline code spans.
const rewriteLinks = (line, page) =>
  line
    .split(/(`+[^`]*`+)/)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(LINK, (_, bang, text, target, title) => `${bang}[${text}](${rewriteTarget(target, bang === '!', page)}${title})`),
    )
    .join('')

const citationLine = (cite) =>
  [`- **${cite.authors}** (${cite.year}). *${cite.title}*.`, cite.publisher && ` ${cite.publisher}.`, cite.url && ` ${cite.url}`]
    .filter(Boolean)
    .join('')

const viewerLine = (file, page) =>
  `[Workflow \`${file}\` (${ofLocale(DOT_SOURCE, page.locale)})](${page.rawRepo}plugins/skraft-framework/workflows/${file}.skraft.dot)`

// One MDX line: what it becomes in the twin (an array of lines; empty to drop it), or undefined when it is plain Markdown.
const mdxLine = (line, page) => {
  const trimmed = line.trim()
  if (/^(import|export)\s/.test(trimmed) || /^<\/?Tabs[\s>]/.test(trimmed) || trimmed === '</TabItem>') return []
  if (/^\{\/\*.*\*\/\}$/.test(trimmed)) return []
  const tab = trimmed.match(/^<TabItem\b.*\blabel="([^"]*)"/)
  if (tab) return [`#### ${tab[1]}`]
  const viewer = trimmed.match(/^<WorkflowViewer\b.*\bfile="([^"]*)".*\/>$/)
  if (viewer) return [viewerLine(viewer[1], page)]
  if (/^<Bibliography\s*\/>$/.test(trimmed)) return page.citations.map(citationLine)
  return undefined
}

const admonitionHead = (match, page) => {
  const label = ofLocale(ADMONITIONS, page.locale)[match[1]] ?? match[1]
  return match[2] ? `> **${label} — ${match[2]}**` : `> **${label}**`
}

const quote = (line) => (line.trim() === '' ? '>' : `> ${line}`)

// State machine over the body lines: `fence` while inside fenced code, `admonition` while inside :::.
const step = (state, line, page) => {
  const fence = line.match(/^\s*(`{3,}|~{3,})/)
  if (state.fence) {
    if (fence && line.trim().startsWith(state.fence)) state.fence = undefined
    return [state.admonition ? quote(line) : line]
  }
  if (fence) {
    state.fence = fence[1]
    return [state.admonition ? quote(line) : line]
  }
  const open = line.match(/^:::(\w+)(?:\[(.*)\])?\s*$/)
  if (open) {
    state.admonition = true
    return [admonitionHead(open, page), '>']
  }
  if (state.admonition && line.trim() === ':::') {
    state.admonition = false
    return []
  }
  const out = mdxLine(line, page) ?? [rewriteLinks(line, page)]
  return state.admonition ? out.map(quote) : out
}

const isPreamble = (line) => line.trim() === '' || /^(import|export)\s/.test(line.trim())

const dropBodyTitle = (lines) => {
  const first = lines.findIndex((line) => !isPreamble(line))
  return first !== -1 && /^# /.test(lines[first]) ? [...lines.slice(0, first), ...lines.slice(first + 1)] : lines
}

const trimBlankEdges = (lines) => {
  const start = lines.findIndex((line) => line.trim() !== '')
  if (start === -1) return []
  let end = lines.length
  while (lines[end - 1].trim() === '') end -= 1
  return lines.slice(start, end)
}

// Dropped MDX lines leave blank runs; fenced code keeps its own.
const collapseBlankRuns = (lines) => {
  let inFence = false
  return lines.filter((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    return inFence || line.trim() !== '' || lines[index - 1]?.trim() !== ''
  })
}

const sourceLine = (page) =>
  [`> Source: ${page.siteUrl}${page.permalink}`, `Version ${page.versionLabel}`, page.locale, page.updated && `Updated ${page.updated}`]
    .filter(Boolean)
    .join(' · ')

/**
 * @param {string} text the doc source (`.md` or `.mdx`)
 * @param {object} page what the twin needs to know about the page: title, permalink (as served), docPath (relative to the
 *   version's docs folder), locale, versionLabel, versionPath, updated (YYYY-MM-DD, optional), siteUrl, baseUrl,
 *   rawRepo (raw GitHub URL at the version ref, ending in `/`), sourceRepoPath, twins (docPath -> twin site path
 *   for the version), citations
 */
export const toMarkdownTwin = (text, page) => {
  const state = { fence: undefined, admonition: false }
  const body = dropBodyTitle(stripFrontMatter(text.replace(/\r\n/g, '\n').split('\n'))).flatMap((line) => step(state, line, page))
  return [`# ${page.title}`, '', sourceLine(page), '', ...collapseBlankRuns(trimBlankEdges(body)), ''].join('\n')
}
