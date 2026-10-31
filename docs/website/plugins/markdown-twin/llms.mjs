// Pure: the llms.txt index and the llms-full.txt bundle of one version in one locale.
// Format: the llms.txt proposal (https://llmstxt.org/): H1, a summary blockquote, then H2 sections of links.

const OTHER_VARIANTS = { en: 'Other versions and languages', fr: 'Autres versions et langues' }

const docIdsOf = (item) => {
  if (item.type === 'doc' || item.type === 'ref') return [item.id]
  if (item.type !== 'category') return []
  const own = item.link?.type === 'doc' ? [item.link.id] : []
  return [...own, ...item.items.flatMap(docIdsOf)]
}

/** The parts of a version in sidebar order: one per top-level category, with its doc ids in order. */
export const partsOf = (sidebars) =>
  Object.values(sidebars)
    .flat()
    .filter((item) => item.type === 'category')
    .map((category) => ({ label: category.label, ids: [...new Set(docIdsOf(category))] }))

/** Docs in reading order: those in no part first (the home), then each part's. */
export const readingOrder = (docs, parts) => {
  const byId = new Map(docs.map((doc) => [doc.id, doc]))
  const inParts = parts.flatMap((part) => part.ids).filter((id) => byId.has(id))
  const outside = docs.filter((doc) => !inParts.includes(doc.id))
  return [...outside, ...inParts.map((id) => byId.get(id))]
}

const entry = (doc) => `- [${doc.title}](${doc.twinUrl})${doc.description ? `: ${doc.description}` : ''}`

const section = (title, lines) => (lines.length ? [`## ${title}`, '', ...lines, ''] : [])

/**
 * @param {{ title: string, summary: string, locale: string, docs: object[], parts: object[], variants: {label: string, url: string}[] }} index
 *   docs carry id, title, description and twinUrl; variants are the other llms.txt files to link (root file only)
 */
export const llmsIndex = ({ title, summary, locale, docs, parts, variants = [] }) => {
  const byId = new Map(docs.map((doc) => [doc.id, doc]))
  const inParts = new Set(parts.flatMap((part) => part.ids))
  const outside = docs.filter((doc) => !inParts.has(doc.id)).map(entry)
  const lines = [
    `# ${title}`,
    '',
    `> ${summary}`,
    '',
    ...(outside.length ? [...outside, ''] : []),
    ...parts.flatMap((part) => section(part.label, part.ids.filter((id) => byId.has(id)).map((id) => entry(byId.get(id))))),
    ...section(OTHER_VARIANTS[locale] ?? OTHER_VARIANTS.en, variants.map((variant) => `- [${variant.label}](${variant.url})`)),
  ]
  return `${lines.join('\n').trimEnd()}\n`
}

/** Every twin text of a version, in reading order, separated by a thematic break. */
export const llmsFull = (twins) => `${twins.map((twin) => twin.trimEnd()).join('\n\n---\n\n')}\n`
