// Converts the Jekyll handbook pages (docs/site/{en,fr}) into Docusaurus pages (docs/website).
// Plan: docs/v2/docusaurus-migration-plan.md, section 3. Zero dependency.

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

/**
 * Converts one Jekyll page.
 * @param {string} source the Jekyll page
 * @param {{ docId: string, locale: 'en'|'fr' }} options
 * @returns {{ text: string, extension: '.md'|'.mdx', findings: object[], redirects: object[] }}
 */
export const convertPage = (source, options) => {
  const page = { ...options, findings: [], redirects: [], phase: null, extension: '.md' }
  const { lines, body } = splitFrontMatter(source)
  const text = convertFrontMatter(lines, page) + body
  return { text, extension: page.extension, findings: page.findings, redirects: page.redirects }
}
