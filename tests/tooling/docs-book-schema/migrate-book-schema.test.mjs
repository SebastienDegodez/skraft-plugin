import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { migrateBook } from '../../../docs/website/scripts/migrate-book-schema.mjs'
import { parseYaml } from '../../../scripts/lib/book.mjs'

const script = fileURLToPath(new URL('../../../docs/website/scripts/migrate-book-schema.mjs', import.meta.url))

// The current schema, cut down to what the migration rewrites.
const oldBook = `# old header
#   - _layouts/doc.html builds the sidebar

meta:
  title_en: "Book"
  # Design : old
  design:
    layout: doc
    artifacts:
      layout: "docs/site/_layouts/doc.html"

  reference_template:
    frontmatter:
      required: [layout, lang, title, description]

sources:
  citations: "docs/website/data/citations.yml"

# old parts comment, see _layouts/doc.html
parts:
  - id: accueil
    title_en: "Home"
    pages:
      - id: home
        label_en: "Home"
        fr: "fr/index.md"
        en: "en/index.md"

  - id: how-to
    diataxis_mode: how-to
    sidebar_position: 2
    title_en: "How-to guides"
    pages:
      - id: install-on-a-host
        type: editorial
        label_en: "Install"
        fr: "fr/how-to/install-on-a-host.md"
        en: "en/how-to/install-on-a-host.md"
        purpose_en: "Install it."
      - id: run-gates
        type: editorial
        label_en: "Run the gates"
        fr: "fr/how-to/run-gates.md"
        en: "en/how-to/run-gates.md"
      - id: contributing
        type: editorial
        label_en: "Propose a pattern"
        fr: "fr/how-to/contributing.mdx"
        en: "en/how-to/contributing.mdx"

  - id: reference
    diataxis_mode: reference
    title_en: "Reference"
    sections:
      - id: catalogue
        title_fr: "Catalogue agentique"
        title_en: "Agentic catalogue"
        sidebar_position: 2
        ownership: dashboard
        retire:
          - "docs/site/fr/reference/agents/*.md"
          - "docs/site/en/reference/agents/*.md"
        pages:
          - id: dashboard
            type: dashboard
            label_en: "Catalogue"
            fr: "fr/dashboard/index.md"
            en: "en/dashboard/index.md"
`

const plan = Object.freeze({
  header: '# new header\n',
  design: '  design:\n    theme: docusaurus-classic\n',
  partsComment: '# new parts comment\n',
  partSlugs: { 'how-to': '/how-to', reference: '/reference' },
  docRenames: { 'dashboard/index': 'reference/catalogue' },
  sectionSlugs: { catalogue: '/reference/agentic-catalogue' },
  sectionIntros: { catalogue: { fr: 'Le catalogue.', en: 'The catalogue.' } },
  partSections: {
    'how-to': [
      { id: 'set-up', title_fr: 'Installer', title_en: 'Set up', intro_fr: 'Installer.', intro_en: 'Install.', sidebar_position: 1, pages: ['install-on-a-host'] },
      { id: 'run-a-story', title_fr: 'Mener une story', title_en: 'Run a story', intro_fr: 'Mener.', intro_en: 'Run.', sidebar_position: 2, pages: ['run-gates', 'contributing'] },
    ],
  },
})

const pagesOf = (book, partId) => book.parts.find((part) => part.id === partId)

test('a page names one doc id, its English path without the language folder and the extension', () => {
  const book = parseYaml(migrateBook(oldBook, plan))
  const home = pagesOf(book, 'accueil').pages[0]
  assert.equal(home.doc, 'index')
  assert.equal('fr' in home, false)
  assert.equal('en' in home, false)
  const [, runAStory] = pagesOf(book, 'how-to').sections
  assert.deepEqual(runAStory.pages.map((page) => page.doc), ['how-to/run-gates', 'how-to/contributing'])
})

test('a renamed doc takes its new id', () => {
  const book = parseYaml(migrateBook(oldBook, plan))
  assert.equal(pagesOf(book, 'reference').sections[0].pages[0].doc, 'reference/catalogue')
})

test('each Diataxis part gets its slug, and the home part none', () => {
  const book = parseYaml(migrateBook(oldBook, plan))
  assert.deepEqual(book.parts.map((part) => part.slug), [undefined, '/how-to', '/reference'])
})

test('the how-to pages move into sections, in the planned order, with their fields kept', () => {
  const book = parseYaml(migrateBook(oldBook, plan))
  const howTo = pagesOf(book, 'how-to')
  assert.equal(howTo.pages, undefined)
  assert.deepEqual(
    howTo.sections.map(({ id, title_fr, title_en, intro_fr, intro_en, sidebar_position, pages }) => ({ id, title_fr, title_en, intro_fr, intro_en, sidebar_position, pages: pages.map((page) => page.id) })),
    [
      { id: 'set-up', title_fr: 'Installer', title_en: 'Set up', intro_fr: 'Installer.', intro_en: 'Install.', sidebar_position: 1, pages: ['install-on-a-host'] },
      { id: 'run-a-story', title_fr: 'Mener une story', title_en: 'Run a story', intro_fr: 'Mener.', intro_en: 'Run.', sidebar_position: 2, pages: ['run-gates', 'contributing'] },
    ],
  )
  assert.deepEqual(howTo.sections[0].pages[0], {
    id: 'install-on-a-host', type: 'editorial', label_en: 'Install', doc: 'how-to/install-on-a-host', purpose_en: 'Install it.',
  })
})

test('an existing section gets its intro and, when planned, its slug', () => {
  const [catalogue] = pagesOf(parseYaml(migrateBook(oldBook, plan)), 'reference').sections
  assert.deepEqual([catalogue.intro_fr, catalogue.intro_en, catalogue.slug], ['Le catalogue.', 'The catalogue.', '/reference/agentic-catalogue'])
})

test('the retire globs point at the two Docusaurus trees', () => {
  const [catalogue] = pagesOf(parseYaml(migrateBook(oldBook, plan)), 'reference').sections
  assert.deepEqual(catalogue.retire, [
    'docs/website/i18n/fr/docusaurus-plugin-content-docs/current/reference/agents/*.md',
    'docs/website/docs/reference/agents/*.md',
  ])
})

test('the header, the design block, the parts comment and the template front matter are rewritten', () => {
  const text = migrateBook(oldBook, plan)
  assert.equal(text.startsWith('# new header\n\nmeta:\n'), true)
  assert.doesNotMatch(text, /_layouts|docs\/site/)
  assert.match(text, /\n# new parts comment\nparts:\n/)
  const book = parseYaml(text)
  assert.deepEqual(book.meta.design, { theme: 'docusaurus-classic' })
  assert.deepEqual(book.meta.reference_template.frontmatter.required, ['title', 'description'])
})

test('migrating a migrated book changes nothing', () => {
  const once = migrateBook(oldBook, plan)
  assert.equal(migrateBook(once, plan), once)
})

test('a how-to page no section plans, or a planned page the book lacks, stops the migration', () => {
  const missing = { ...plan, partSections: { 'how-to': [{ ...plan.partSections['how-to'][0], pages: ['install-on-a-host', 'run-gates'] }] } }
  assert.throws(() => migrateBook(oldBook, missing), /how-to: no section plans the page\(s\) contributing/)
  const extra = { ...plan, partSections: { 'how-to': [...plan.partSections['how-to'], { ...plan.partSections['how-to'][0], id: 'more', pages: ['ghost'] }] } }
  assert.throws(() => migrateBook(oldBook, extra), /how-to: the book has no page ghost/)
})

test('a section without a planned intro, or FR and EN paths that differ, stops the migration', () => {
  assert.throws(() => migrateBook(oldBook, { ...plan, sectionIntros: {} }), /section catalogue has no planned intro/)
  const mismatch = oldBook.replace('en: "en/how-to/run-gates.md"', 'en: "en/how-to/run-the-gates.md"')
  assert.throws(() => migrateBook(mismatch, plan), /FR and EN paths differ: fr\/how-to\/run-gates\.md, en\/how-to\/run-the-gates\.md/)
})

test('the command rewrites the file in place, and --check fails until it is migrated', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'book-schema-'))
  try {
    const file = join(dir, 'book.yml')
    const real = await readFile(fileURLToPath(new URL('../../../docs/website/book.yml', import.meta.url)), 'utf8')
    await writeFile(file, real)
    const run = (...args) => spawnSync(process.execPath, [script, '--book', file, ...args], { encoding: 'utf8' })
    const migrated = migrateBook(real)
    if (migrated !== real) assert.equal(run('--check').status, 1)
    assert.equal(run().status, 0)
    assert.equal(await readFile(file, 'utf8'), migrated)
    assert.equal(run('--check').status, 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
