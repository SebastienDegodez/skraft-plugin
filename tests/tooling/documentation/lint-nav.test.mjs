import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { lintNav } from '../../../scripts/lint-nav.mjs'

const FR = 'i18n/fr/docusaurus-plugin-content-docs/current'

const book = ({ extraPage = '', partSlug = '    slug: /how-to\n', sectionIntro = true, sectionSlug = '' } = {}) => `parts:
  - id: accueil
    pages:
      - id: home
        doc: index
  - id: how-to
    diataxis_mode: how-to
${partSlug}    title_fr: Guides
    title_en: Guides
    sections:
      - id: set-up
        title_fr: Installer
        title_en: Set up
${sectionIntro ? '        intro_fr: Installer.\n        intro_en: Install.\n' : ''}${sectionSlug}        pages:
          - id: install
            doc: how-to/install
          - id: run-gates
            doc: how-to/run-gates
${extraPage}`

const page = (body, description = 'A page.') => `---\ntitle: Page\ndescription: "${description}"\n---\n\n# Page\n\n${body}\n`

const cleanFiles = {
  'docs/index.mdx': page('import Link from "@docusaurus/Link"\n\n<Link to="/how-to">Guides</Link>'),
  'docs/how-to/install.md': page('Then [run the gates](./run-gates.md#first) and see ![the shot](/img/shot.png).'),
  'docs/how-to/run-gates.md': page('Open [the catalogue](pathname:///dashboard/) or [the README](https://github.com/o/r/blob/main/README.md).'),
  [`${FR}/index.mdx`]: page('<Tabs>\n</Tabs>'),
  [`${FR}/how-to/install.md`]: page('Puis [lancer les gates](run-gates.md).'),
  [`${FR}/how-to/run-gates.md`]: page('Texte.'),
}

async function lint({ bookText = book(), files = {} } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'lint-nav-'))
  try {
    const siteRoot = join(root, 'docs/website')
    for (const [path, content] of Object.entries({ ...cleanFiles, ...files })) {
      if (content === null) continue
      await mkdir(join(siteRoot, path, '..'), { recursive: true })
      await writeFile(join(siteRoot, path), content)
    }
    await writeFile(join(siteRoot, 'book.yml'), bookText)
    return lintNav({ bookPath: join(siteRoot, 'book.yml'), root, siteRoot })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const codes = (problems) => problems.map(({ code, where }) => `${code} ${where}`)

test('a book on the Docusaurus schema whose pages link relatively has no problem', async () => {
  assert.deepEqual(await lint(), [])
})

test('a link to /en/, /fr/, a site-absolute page or through Liquid is reported; images, pathname links and code are not', async () => {
  const problems = await lint({
    files: {
      'docs/how-to/run-gates.md': page([
        'See [install](/en/how-to/install) and [the guides](/how-to/install).',
        '',
        '```md',
        '[ignored](/en/how-to/install)',
        '```',
      ].join('\n')),
      [`${FR}/how-to/run-gates.md`]: page('Voir [installer]({{ "/fr/how-to/install" | relative_url }}).'),
    },
  })
  assert.deepEqual(codes(problems), [
    'NAV-LINK-ABSOLUTE docs/website/docs/how-to/run-gates.md:8',
    'NAV-LINK-ABSOLUTE docs/website/docs/how-to/run-gates.md:8',
    `NAV-LINK-ABSOLUTE docs/website/${FR}/how-to/run-gates.md:8`,
  ])
  assert.match(problems[0].message, /"\/en\/how-to\/install" must be a relative file link/)
})

test('a relative link to a Markdown file that does not exist in the same locale is dangling', async () => {
  const problems = await lint({ files: { [`${FR}/how-to/install.md`]: page('Voir [le glossaire](../reference/glossary.md#terme) et [gates](./run-gates.mdx).') } })
  assert.deepEqual(codes(problems), [
    `NAV-LINK-DANGLING docs/website/${FR}/how-to/install.md:8`,
    `NAV-LINK-DANGLING docs/website/${FR}/how-to/install.md:8`,
  ])
})

test('a doc file that book.yml does not declare is reported, in either locale', async () => {
  const problems = await lint({ files: { 'docs/how-to/orphan.md': page('Text.'), [`${FR}/reference/stray.mdx`]: page('<Tabs />') } })
  assert.deepEqual(codes(problems), [
    'NAV-DOC-UNDECLARED docs/website/docs/how-to/orphan.md',
    `NAV-DOC-UNDECLARED docs/website/${FR}/reference/stray.mdx`,
  ])
})

test('an .mdx page without JSX is reported; an import, an export or a component is JSX', async () => {
  const problems = await lint({
    files: {
      'docs/how-to/install.md': null,
      'docs/how-to/install.mdx': page('Only prose, a {/* #id */} comment and `<Tabs>` in code.\n\n```jsx\n<Tabs />\n```'),
      'docs/how-to/run-gates.md': null,
      'docs/how-to/run-gates.mdx': page('export const x = 1'),
    },
  })
  assert.deepEqual(codes(problems), ['NAV-MDX-NO-JSX docs/website/docs/how-to/install.mdx'])
})

test('a front matter description over 160 characters is reported as a warning', async () => {
  const problems = await lint({
    files: {
      'docs/how-to/install.md': page('Text.', 'é'.repeat(161)),
      'docs/how-to/run-gates.md': page('Text.', 'é'.repeat(160)),
    },
  })
  assert.deepEqual(codes(problems), ['NAV-DESCRIPTION-LONG docs/website/docs/how-to/install.md'])
  assert.match(problems[0].message, /161 characters/)
  assert.equal(problems[0].severity, 'warning')
})

test('a page without a doc id, a doc declared twice, a part without slug and a section without intro are reported', async () => {
  const problems = await lint({
    bookText: book({
      partSlug: '',
      sectionIntro: false,
      extraPage: '          - id: again\n            doc: how-to/install\n          - id: nameless\n',
    }),
  })
  assert.deepEqual(problems.map(({ code }) => code), ['NAV-PART-SLUG', 'NAV-SECTION-INTRO', 'NAV-DOC-DUP', 'NAV-PAGE-DOC'])
})

test('a generated index whose route is already a doc route is a slug collision, unless the section names its own slug', async () => {
  const collide = (doc, sectionSlug) => book({ extraPage: `          - id: set-up-page\n            doc: ${doc}\n`, sectionSlug })
  const files = (doc) => ({ [`docs/${doc}.md`]: page('Text.'), [`${FR}/${doc}.md`]: page('Texte.') })
  const problems = await lint({ bookText: collide('how-to/set-up/index', ''), files: files('how-to/set-up/index') })
  assert.deepEqual(codes(problems), ['NAV-SLUG-COLLISION book.yml > parts[1] (how-to) > sections[0] (set-up)'])
  assert.match(problems[0].message, /\/how-to\/set-up is both the generated index of section set-up and the route of doc how-to\/set-up\/index/)
  const sameNameAsFolder = await lint({ bookText: collide('how-to/set-up/Set-Up', ''), files: files('how-to/set-up/Set-Up') })
  assert.deepEqual(sameNameAsFolder.map(({ code }) => code), ['NAV-SLUG-COLLISION'])
  assert.deepEqual(await lint({ bookText: collide('how-to/set-up/index', '        slug: /how-to/setting-up\n'), files: files('how-to/set-up/index') }), [])
})
