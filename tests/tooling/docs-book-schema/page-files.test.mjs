import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { docFilesOnDisk, pageFiles, pagesOfSection } from '../../../scripts/lib/book.mjs'

const FR = join('i18n', 'fr', 'docusaurus-plugin-content-docs', 'current')

async function withSite(files, body) {
  const siteRoot = await mkdtemp(join(tmpdir(), 'page-files-'))
  try {
    for (const file of files) {
      await mkdir(join(siteRoot, file, '..'), { recursive: true })
      await writeFile(join(siteRoot, file), '# page\n')
    }
    await body(siteRoot)
  } finally {
    await rm(siteRoot, { recursive: true, force: true })
  }
}

test('a doc id resolves to its EN file under docs/ and its FR file under the i18n tree, .md or .mdx', () =>
  withSite([join('docs', 'how-to', 'run-gates.md'), join(FR, 'how-to', 'run-gates.md'), join('docs', 'index.mdx'), join(FR, 'index.mdx')], (siteRoot) => {
    assert.deepEqual(pageFiles({ doc: 'how-to/run-gates' }, siteRoot), {
      en: join(siteRoot, 'docs', 'how-to', 'run-gates.md'),
      fr: join(siteRoot, FR, 'how-to', 'run-gates.md'),
    })
    assert.deepEqual(pageFiles({ doc: 'index' }, siteRoot), { en: join(siteRoot, 'docs', 'index.mdx'), fr: join(siteRoot, FR, 'index.mdx') })
  }))

test('a doc with no file on disk resolves to the .md path it should have', () =>
  withSite([join('docs', 'reference', 'cli.mdx')], (siteRoot) => {
    assert.deepEqual(pageFiles({ doc: 'reference/cli' }, siteRoot), {
      en: join(siteRoot, 'docs', 'reference', 'cli.mdx'),
      fr: join(siteRoot, FR, 'reference', 'cli.md'),
    })
  }))

test('the doc files on disk are listed per locale with their doc id, partials and other files aside', () =>
  withSite([
    join('docs', 'index.mdx'), join('docs', 'how-to', 'run-gates.md'), join(FR, 'how-to', 'run-gates.md'),
    join('docs', 'img', 'logo.png'), join('docs', '_partials', 'note.md'), join(FR, '_note.mdx'),
  ], (siteRoot) => {
    assert.deepEqual(docFilesOnDisk(siteRoot), [
      { locale: 'en', doc: 'how-to/run-gates', file: join(siteRoot, 'docs', 'how-to', 'run-gates.md') },
      { locale: 'en', doc: 'index', file: join(siteRoot, 'docs', 'index.mdx') },
      { locale: 'fr', doc: 'how-to/run-gates', file: join(siteRoot, FR, 'how-to', 'run-gates.md') },
    ])
  }))

test('a generated page takes its doc id from the generate directive', () =>
  withSite([join('plugins', 'a', 'agents', 'scout.agent.md')], (root) => {
    const section = { id: 'agents', generate: { from: 'agents', slug_from: 'basename', doc: 'reference/agents/{slug}' } }
    const [page] = pagesOfSection(section, { sources: { agents: 'plugins/*/agents/*.agent.md' }, root })
    assert.deepEqual([page.id, page.doc, page.source], ['agents-scout', 'reference/agents/scout', 'plugins/a/agents/scout.agent.md'])
  }))
