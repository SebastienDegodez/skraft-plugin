import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sidebarsFromBook } from '../../../docs/website/src/book/sidebars-from-book.mjs'

const page = (id, folder, extra = {}) => ({
  id,
  label_en: `Label ${id}`,
  label_fr: `Libelle ${id}`,
  fr: `fr/${folder}/${id}.md`,
  en: `en/${folder}/${id}.md`,
  ...extra,
})

const book = Object.freeze({
  parts: [
    { id: 'accueil', title_en: 'Home', pages: [{ id: 'home', label_en: 'Home', en: 'en/index.md', fr: 'fr/index.md' }] },
    {
      id: 'how-to',
      diataxis_mode: 'how-to',
      title_en: 'How-to guides',
      intro_en: 'Solve a precise task.',
      pages: [page('install', 'how-to'), page('run-gates', 'how-to')],
    },
    {
      id: 'explanation',
      diataxis_mode: 'explanation',
      title_en: 'Explanation',
      intro_en: 'The why.',
      sections: [
        { id: 'orientation', title_en: 'Orientation', pages: [page('index', 'explanation/pipeline')] },
        { id: 'deep-dives', title_en: 'Deep dives', intro_en: 'Go further.', pages: [page('tdd', 'explanation/deep-dive')] },
      ],
    },
  ],
})

test('one sidebar per Diataxis part, named in camelCase, with the home part left out', () => {
  assert.deepEqual(Object.keys(sidebarsFromBook(book)), ['howTo', 'explanation'])
})

test('a part is one open, non-collapsible category whose generated index carries its title and intro', () => {
  const [part] = sidebarsFromBook(book).howTo
  assert.deepEqual(
    { type: part.type, key: part.key, label: part.label, collapsible: part.collapsible, collapsed: part.collapsed, link: part.link },
    {
      type: 'category',
      key: 'how-to',
      label: 'How-to guides',
      collapsible: false,
      collapsed: false,
      link: { type: 'generated-index', slug: '/how-to', title: 'How-to guides', description: 'Solve a precise task.' },
    },
  )
})

test('a page becomes a doc whose id is its English path without the language folder and extension', () => {
  const [part] = sidebarsFromBook(book).howTo
  assert.deepEqual(part.items, [
    { type: 'doc', id: 'how-to/install', label: 'Label install' },
    { type: 'doc', id: 'how-to/run-gates', label: 'Label run-gates' },
  ])
})

test('a section becomes a category under its part, with a generated index slug of part and section', () => {
  const [part] = sidebarsFromBook(book).explanation
  const [orientation, deepDives] = part.items
  assert.deepEqual(
    [orientation.key, orientation.label, orientation.link],
    ['orientation', 'Orientation', { type: 'generated-index', slug: '/explanation/orientation', title: 'Orientation' }],
  )
  assert.deepEqual(deepDives.link, { type: 'generated-index', slug: '/explanation/deep-dives', title: 'Deep dives', description: 'Go further.' })
  assert.deepEqual(deepDives.items, [{ type: 'doc', id: 'explanation/deep-dive/tdd', label: 'Label tdd' }])
})

test('a page without a file on disk is left out, and a section left empty goes with it', () => {
  const present = new Set(['how-to/install', 'explanation/pipeline/index'])
  const sidebars = sidebarsFromBook(book, { hasDoc: (id) => present.has(id) })
  assert.deepEqual(sidebars.howTo[0].items, [{ type: 'doc', id: 'how-to/install', label: 'Label install' }])
  assert.deepEqual(sidebars.explanation[0].items.map((item) => item.key), ['orientation'])
})

test('a part with no page on disk has no sidebar', () => {
  assert.deepEqual(Object.keys(sidebarsFromBook(book, { hasDoc: (id) => id === 'how-to/install' })), ['howTo'])
})
