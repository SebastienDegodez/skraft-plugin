// Pure: the French sidebar translations (i18n/fr/docusaurus-plugin-content-docs/current.json)
// derived from book.yml. Keys and descriptions follow what `docusaurus write-translations`
// writes for the sidebars of sidebarsFromBook (plugin-content-docs 3.10.2, translations.js):
// per sidebar, its categories (label, generated-index title and description), then its docs.
// Every doc declared in the book gets its key, whether or not its file exists yet.

import { sidebarIdOf } from './sidebars-from-book.mjs'

/** Keys that book.yml does not produce and the file keeps as they are. */
const KEPT_KEYS = ['version.label']

const entry = (message, description) => ({ message, description })

const categoryEntries = (sidebar, node, label, errors) => {
  const prefix = `sidebar.${sidebar}.category.${node.id}`
  const describe = (what) => `The ${what} for category '${label}' in sidebar '${sidebar}'`
  const french = (key, field) => {
    if (!node[field]) errors.push(`${key}: book.yml has no ${field} for ${node.id}`)
    return node[field]
  }
  const entries = [
    [prefix, entry(french(prefix, 'title_fr'), describe('label'))],
    [`${prefix}.link.generated-index.title`, entry(node.title_fr, `The generated-index page title for category '${label}' in sidebar '${sidebar}'`)],
  ]
  if (node.intro_en) {
    const key = `${prefix}.link.generated-index.description`
    entries.push([key, entry(french(key, 'intro_fr'), `The generated-index page description for category '${label}' in sidebar '${sidebar}'`)])
  }
  return entries
}

const docEntry = (sidebar, page, errors) => {
  const key = `sidebar.${sidebar}.doc.${page.doc}`
  if (!page.label_fr) errors.push(`${key}: book.yml has no label_fr for ${page.doc}`)
  return [key, entry(page.label_fr, `The label for the doc item '${page.label_en}' in sidebar '${sidebar}', linking to the doc ${page.doc}`)]
}

const partEntries = (part, errors) => {
  const sidebar = sidebarIdOf(part)
  const sections = part.sections ?? []
  const pages = sections.length ? sections.flatMap((section) => section.pages ?? []) : part.pages ?? []
  return [
    ...categoryEntries(sidebar, part, part.title_en, errors),
    ...sections.flatMap((section) => categoryEntries(sidebar, section, section.title_en, errors)),
    ...pages.map((page) => docEntry(sidebar, page, errors)),
  ]
}

/**
 * @param {{ parts?: object[] }} book the parsed book.yml
 * @param {Record<string, {message: string, description: string}>} existing the current.json in place
 * @returns {{ translations: object, errors: string[] }}
 */
export const translationsFromBook = (book, existing) => {
  const errors = []
  const kept = KEPT_KEYS.filter((key) => existing[key]).map((key) => [key, existing[key]])
  const derived = (book.parts ?? []).filter((part) => part.diataxis_mode).flatMap((part) => partEntries(part, errors))
  return { translations: Object.fromEntries([...kept, ...derived]), errors }
}
