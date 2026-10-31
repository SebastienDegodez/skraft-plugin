import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { translationsFromBook } from '../../../docs/website/src/book/translations-from-book.mjs'

const script = fileURLToPath(new URL('../../../docs/website/scripts/book-translations.mjs', import.meta.url))

const book = Object.freeze({
  parts: [
    { id: 'accueil', title_en: 'Home', title_fr: 'Accueil', pages: [{ id: 'home', doc: 'index', label_en: 'Home', label_fr: 'Accueil' }] },
    {
      id: 'how-to',
      diataxis_mode: 'how-to',
      slug: '/how-to',
      title_en: 'How-to guides',
      title_fr: 'Guides pratiques',
      intro_en: 'Solve a task.',
      intro_fr: 'Résoudre une tâche.',
      sections: [
        {
          id: 'set-up',
          title_en: 'Set up',
          title_fr: 'Mettre en place',
          intro_en: 'Install.',
          intro_fr: 'Installer.',
          pages: [
            { id: 'install', doc: 'how-to/install', label_en: 'Install', label_fr: 'Installer' },
            { id: 'models', doc: 'how-to/models', label_en: 'Models', label_fr: 'Modèles' },
          ],
        },
      ],
    },
  ],
})

const messages = (translations) => Object.fromEntries(Object.entries(translations).map(([key, { message }]) => [key, message]))

test('every sidebar label, generated-index title and description gets its French text from book.yml, keyed by the book ids', () => {
  const { translations, errors } = translationsFromBook(book, {})
  assert.deepEqual(errors, [])
  assert.deepEqual(messages(translations), {
    'sidebar.howTo.category.how-to': 'Guides pratiques',
    'sidebar.howTo.category.how-to.link.generated-index.title': 'Guides pratiques',
    'sidebar.howTo.category.how-to.link.generated-index.description': 'Résoudre une tâche.',
    'sidebar.howTo.category.set-up': 'Mettre en place',
    'sidebar.howTo.category.set-up.link.generated-index.title': 'Mettre en place',
    'sidebar.howTo.category.set-up.link.generated-index.description': 'Installer.',
    'sidebar.howTo.doc.how-to/install': 'Installer',
    'sidebar.howTo.doc.how-to/models': 'Modèles',
  })
})

test('each entry carries the description Docusaurus writes for it', () => {
  const { translations } = translationsFromBook(book, {})
  assert.equal(translations['sidebar.howTo.category.set-up'].description, "The label for category 'Set up' in sidebar 'howTo'")
  assert.equal(
    translations['sidebar.howTo.doc.how-to/install'].description,
    "The label for the doc item 'Install' in sidebar 'howTo', linking to the doc how-to/install",
  )
})

test('the version label is kept from the existing file, and a key book.yml no longer produces is dropped', () => {
  const existing = {
    'version.label': { message: 'Aperçu 2.0', description: 'The label for version current' },
    'sidebar.howTo.doc.Install': { message: 'Installer', description: 'old key' },
  }
  const { translations } = translationsFromBook(book, existing)
  assert.deepEqual(Object.keys(translations).slice(0, 2), ['version.label', 'sidebar.howTo.category.how-to'])
  assert.equal(translations['version.label'].message, 'Aperçu 2.0')
  assert.equal('sidebar.howTo.doc.Install' in translations, false)
})

test('a key without its French source in book.yml is an error that names the key and the missing field', () => {
  const partial = structuredClone(book)
  delete partial.parts[1].sections[0].pages[1].label_fr
  delete partial.parts[1].sections[0].intro_fr
  const { errors } = translationsFromBook(partial, {})
  assert.deepEqual(errors, [
    'sidebar.howTo.category.set-up.link.generated-index.description: book.yml has no intro_fr for set-up',
    'sidebar.howTo.doc.how-to/models: book.yml has no label_fr for how-to/models',
  ])
})

test('the command writes current.json, and --check fails while the file differs from book.yml', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'book-translations-'))
  try {
    const bookPath = join(dir, 'book.yml')
    const out = join(dir, 'current.json')
    await writeFile(bookPath, [
      'parts:',
      '  - id: how-to',
      '    diataxis_mode: how-to',
      '    slug: /how-to',
      '    title_en: "How-to guides"',
      '    title_fr: "Guides pratiques"',
      '    pages:',
      '      - id: install',
      '        doc: how-to/install',
      '        label_en: "Install"',
      '        label_fr: "Installer"',
      '',
    ].join('\n'))
    await writeFile(out, '{}\n')
    const run = (...args) => spawnSync(process.execPath, [script, '--book', bookPath, '--out', out, ...args], { encoding: 'utf8' })
    assert.equal(run('--check').status, 1)
    assert.equal(run().status, 0)
    assert.equal(JSON.parse(await readFile(out, 'utf8'))['sidebar.howTo.doc.how-to/install'].message, 'Installer')
    assert.equal(run('--check').status, 0)
    await writeFile(bookPath, (await readFile(bookPath, 'utf8')).replace('        label_fr: "Installer"\n', ''))
    const refused = run()
    assert.equal(refused.status, 1)
    assert.match(refused.stderr, /sidebar\.howTo\.doc\.how-to\/install: book\.yml has no label_fr/)
    assert.equal(JSON.parse(await readFile(out, 'utf8'))['sidebar.howTo.doc.how-to/install'].message, 'Installer')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('the committed French sidebar translations match book.yml', () => {
  const result = spawnSync(process.execPath, [script, '--check'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
})
