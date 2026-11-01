import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sidebarsFromBook } from '../../../docs/website/src/book/sidebars-from-book.mjs'

const page = (doc, extra = {}) => ({
  id: doc.split('/').pop(),
  label_en: `Label ${doc}`,
  label_fr: `Libelle ${doc}`,
  doc,
  ...extra,
})

const book = Object.freeze({
  parts: [
    { id: 'accueil', title_en: 'Home', pages: [{ id: 'home', label_en: 'Home', doc: 'index' }] },
    {
      id: 'how-to',
      diataxis_mode: 'how-to',
      slug: '/how-to',
      title_en: 'How-to guides',
      intro_en: 'Solve a precise task.',
      pages: [page('how-to/install'), page('how-to/run-gates')],
    },
    {
      id: 'explanation',
      diataxis_mode: 'explanation',
      slug: '/understand',
      title_en: 'Explanation',
      intro_en: 'The why.',
      sections: [
        { id: 'orientation', title_en: 'Orientation', intro_en: 'Where to enter.', pages: [page('explanation/pipeline/index')] },
        {
          id: 'deep-dives',
          title_en: 'Deep dives',
          intro_en: 'Go further.',
          slug: '/understand/in-depth',
          pages: [page('explanation/deep-dive/tdd'), page('explanation/deep-dive/walking-skeleton')],
        },
      ],
    },
  ],
})

test('one sidebar per Diataxis part, named in camelCase, with the home part left out', () => {
  assert.deepEqual(Object.keys(sidebarsFromBook(book)), ['howTo', 'explanation'])
})

test('a part is one open, non-collapsible category whose generated index sits at the part slug with its title and intro', () => {
  const [part] = sidebarsFromBook(book).explanation
  assert.deepEqual(
    { type: part.type, key: part.key, label: part.label, collapsible: part.collapsible, collapsed: part.collapsed, link: part.link },
    {
      type: 'category',
      key: 'explanation',
      label: 'Explanation',
      collapsible: false,
      collapsed: false,
      link: { type: 'generated-index', slug: '/understand', title: 'Explanation', description: 'The why.' },
    },
  )
})

test('a page becomes a doc keyed by its doc id, labelled in English', () => {
  const [part] = sidebarsFromBook(book).howTo
  assert.deepEqual(part.items, [
    { type: 'doc', id: 'how-to/install', key: 'how-to/install', label: 'Label how-to/install' },
    { type: 'doc', id: 'how-to/run-gates', key: 'how-to/run-gates', label: 'Label how-to/run-gates' },
  ])
})

test('a section becomes a category whose generated index sits at part slug and section id, or at its own slug', () => {
  const [part] = sidebarsFromBook(book).explanation
  const [orientation, deepDives] = part.items
  assert.deepEqual(
    [orientation.type, orientation.key, orientation.label, orientation.link],
    ['category', 'orientation', 'Orientation', { type: 'generated-index', slug: '/understand/orientation', title: 'Orientation', description: 'Where to enter.' }],
  )
  assert.deepEqual(deepDives.link, { type: 'generated-index', slug: '/understand/in-depth', title: 'Deep dives', description: 'Go further.' })
  assert.deepEqual(deepDives.items.map((item) => item.id), ['explanation/deep-dive/tdd', 'explanation/deep-dive/walking-skeleton'])
})

test('a page without a file on disk is left out, and a section left empty goes with it', () => {
  const present = new Set(['how-to/install', 'explanation/pipeline/index'])
  const sidebars = sidebarsFromBook(book, { hasDoc: (id) => present.has(id) })
  assert.deepEqual(sidebars.howTo[0].items.map((item) => item.id), ['how-to/install'])
  assert.deepEqual(sidebars.explanation[0].items.map((item) => item.key), ['orientation'])
})

test('a part with no page on disk has no sidebar', () => {
  assert.deepEqual(Object.keys(sidebarsFromBook(book, { hasDoc: (id) => id === 'how-to/install' })), ['howTo'])
})
