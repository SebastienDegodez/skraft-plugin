import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { iterPages, loadBook, pageFiles } from '../../../scripts/lib/book.mjs'
import { lintNav } from '../../../scripts/lint-nav.mjs'
import { scanDrift } from '../../../scripts/scan-drift.mjs'
import { sidebarsFromBook } from '../../../docs/website/src/book/sidebars-from-book.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const bookPath = join(root, 'docs/website/book.yml')
const PAGE = '---\ntitle: Page\ndescription: "A page."\n---\n\n# Page\n\nOne.\n\nTwo.\n\nThree.\n'

/** A site where every doc book.yml declares exists in both locales, as after the bulk conversion. */
async function withFullTree(body) {
  const siteRoot = await mkdtemp(join(tmpdir(), 'full-tree-'))
  try {
    for (const { page } of iterPages(loadBook(bookPath))) {
      for (const file of Object.values(pageFiles(page, siteRoot))) {
        await mkdir(join(file, '..'), { recursive: true })
        await writeFile(file, PAGE)
      }
    }
    await body(siteRoot)
  } finally {
    await rm(siteRoot, { recursive: true, force: true })
  }
}

test('the real book.yml passes lint-nav once every declared doc exists in both locales', () =>
  withFullTree((siteRoot) => {
    assert.deepEqual(lintNav({ bookPath, root, siteRoot }).filter(({ severity }) => severity === 'error'), [])
  }))

test('the real book.yml leaves scan-drift no page to report once every declared doc exists in both locales', () =>
  withFullTree((siteRoot) => {
    const pageItems = scanDrift({ bookPath, root, siteRoot, emptyThreshold: 4 }).items
      .filter(({ type }) => ['missing-page', 'parity-break', 'empty-page'].includes(type))
    assert.deepEqual(pageItems, [])
  }))

test('the real book.yml gives the four Diataxis sidebars, the how-to one cut into seven sections', () => {
  const sidebars = sidebarsFromBook(loadBook(bookPath))
  assert.deepEqual(Object.keys(sidebars), ['tutorials', 'howTo', 'explanation', 'reference'])
  assert.deepEqual(sidebars.howTo[0].items.map(({ key, items }) => `${key}:${items.length}`), [
    'set-up:4', 'run-a-story:4', 'review:2', 'adapt-the-workflow:2', 'backlog:2', 'existing-code:2', 'contribute:2',
  ])
})
