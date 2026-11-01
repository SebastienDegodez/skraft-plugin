// Pure: turns the book contract (book.yml) into Docusaurus sidebars, one per Diataxis part.
// A page names its doc id (`doc: how-to/run-gates`); its EN file is docs/<doc>.md(x) and its FR
// file has the same relative path under i18n/fr/docusaurus-plugin-content-docs/current/.
// Every item carries a `key`, so the FR translation keys (book-translations.mjs) follow the
// book's ids, not the English labels.

const camelCase = (id) => id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())

const link = (slug, title, description) => ({
  type: 'generated-index',
  slug,
  title,
  ...(description ? { description } : {}),
})

const docItem = (page) => ({ type: 'doc', id: page.doc, key: page.doc, label: page.label_en })

const pagesOf = (container, hasDoc) =>
  (container.pages ?? []).filter((page) => hasDoc(page.doc)).map(docItem)

/** The route of a section's generated index: its own `slug`, else `<part slug>/<section id>`. */
export const sectionSlug = (part, section) => section.slug ?? `${part.slug}/${section.id}`

const sectionCategory = (part, section, hasDoc) => ({
  type: 'category',
  key: section.id,
  label: section.title_en,
  link: link(sectionSlug(part, section), section.title_en, section.intro_en),
  items: pagesOf(section, hasDoc),
})

const itemsOfPart = (part, hasDoc) =>
  part.sections
    ? part.sections.map((section) => sectionCategory(part, section, hasDoc)).filter((category) => category.items.length > 0)
    : pagesOf(part, hasDoc)

const partCategory = (part, hasDoc) => ({
  type: 'category',
  key: part.id,
  label: part.title_en,
  collapsible: false,
  collapsed: false,
  link: link(part.slug, part.title_en, part.intro_en),
  items: itemsOfPart(part, hasDoc),
})

/** The sidebar id of a Diataxis part: its id in camelCase (`how-to` -> `howTo`). */
export const sidebarIdOf = (part) => camelCase(part.id)

/**
 * @param {{ parts?: object[] }} book the parsed book.yml
 * @param {{ hasDoc?: (id: string) => boolean }} [options] `hasDoc` tells whether a doc id has a file on disk
 */
export const sidebarsFromBook = (book, { hasDoc = () => true } = {}) =>
  Object.fromEntries(
    (book.parts ?? [])
      .filter((part) => part.diataxis_mode)
      .map((part) => [sidebarIdOf(part), partCategory(part, hasDoc)])
      .filter(([, category]) => category.items.length > 0)
      .map(([key, category]) => [key, [category]]),
  )
