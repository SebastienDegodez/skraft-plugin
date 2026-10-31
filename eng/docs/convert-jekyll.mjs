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

const DEFAULT_MDX_DOCS = ['index', 'reference/citations']

/**
 * Converts one Jekyll page.
 * @param {string} source the Jekyll page
 * @param {{ docId: string, locale: 'en'|'fr' }} options
 * @returns {{ text: string, extension: '.md'|'.mdx', findings: object[], redirects: object[] }}
 */
export const convertPage = (source, options) => {
  const mdxDocs = new Set([...DEFAULT_MDX_DOCS, ...(options.mdxDocs ?? [])])
  const page = { ...options, mdxDocs, source, seen: new Map(), findings: [], redirects: [], phase: null }
  page.extension = extensionOf(page.docId, page)
  const { lines, body } = splitFrontMatter(source)
  let text = body
  text = convertCitationLinks(text, page)
  text = convertInternalLinks(text, page)
  text = convertIncludes(text, page)
  text = convertRunningExample(text, page)
  text = convertRawBlocks(text)
  text = convertFrontMatter(lines, page) + text
  return { text, extension: page.extension, findings: page.findings, redirects: page.redirects }
}
