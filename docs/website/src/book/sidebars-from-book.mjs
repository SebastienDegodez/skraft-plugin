// Pure: turns the book contract (book.yml) into Docusaurus sidebars, one per Diataxis part.
// WP0 reads the current schema, where a page names its files as `en: "en/<doc>.md"`;
// the doc id is that path without the language folder and the extension.

const camelCase = (id) => id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())

const docIdOf = (page) => page.en.replace(/^en\//, '').replace(/\.mdx?$/, '')

const link = (slug, title, description) => ({
  type: 'generated-index',
  slug,
  title,
  ...(description ? { description } : {}),
})

const docItem = (page) => ({ type: 'doc', id: docIdOf(page), label: page.label_en })

const pagesOf = (container, hasDoc) =>
  (container.pages ?? []).filter((page) => hasDoc(docIdOf(page))).map(docItem)

const sectionCategory = (partSlug, section, hasDoc) => ({
  type: 'category',
  key: section.id,
  label: section.title_en,
  link: link(`${partSlug}/${section.id}`, section.title_en, section.intro_en),
  items: pagesOf(section, hasDoc),
})

const itemsOfPart = (partSlug, part, hasDoc) =>
  part.sections
    ? part.sections.map((section) => sectionCategory(partSlug, section, hasDoc)).filter((category) => category.items.length > 0)
    : pagesOf(part, hasDoc)

const partCategory = (part, hasDoc) => {
  const slug = part.slug ?? `/${part.id}`
  return {
    type: 'category',
    key: part.id,
    label: part.title_en,
    collapsible: false,
    collapsed: false,
    link: link(slug, part.title_en, part.intro_en),
    items: itemsOfPart(slug, part, hasDoc),
  }
}

/**
 * @param {{ parts?: object[] }} book the parsed book.yml
 * @param {{ hasDoc?: (id: string) => boolean }} [options] `hasDoc` tells whether a doc id has a file on disk
 */
export const sidebarsFromBook = (book, { hasDoc = () => true } = {}) =>
  Object.fromEntries(
    (book.parts ?? [])
      .filter((part) => part.diataxis_mode)
      .map((part) => [camelCase(part.id), partCategory(part, hasDoc)])
      .filter(([, category]) => category.items.length > 0)
      .map(([key, category]) => [key, [category]]),
  )
