import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  redirectPage,
  writeDirectoryIndexes,
  writeSearchFolderIndex,
} from '../../../docs/website/plugins/redirects/redirect-pages.mjs'

const withSite = async (files, run) => {
  const outDir = await mkdtemp(join(tmpdir(), 'skraft-redirects-'))
  try {
    for (const file of files) {
      await mkdir(join(outDir, file, '..'), { recursive: true })
      await writeFile(join(outDir, file), `<html>${file}</html>`)
    }
    await run(outDir)
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
}

test('an old .html address keeps the query and the anchor through the redirect script', () => {
  const page = redirectPage('/reference/cli')
  assert.match(page, /<script>location\.replace\("\/reference\/cli"\+location\.search\+location\.hash\)<\/script>/)
  assert.match(page, /<meta http-equiv="refresh" content="0; url=\/reference\/cli">/)
  assert.ok(page.indexOf('<script>') < page.indexOf('http-equiv="refresh"'))
})

test('the redirect target cannot close the script tag', () => {
  const script = redirectPage('/a</script><b>').match(/<script>(.*?)<\/script>/)[1]
  assert.equal(script, 'location.replace("/a\\u003c/script>\\u003cb>"+location.search+location.hash)')
})

test('a French page with a same-named folder gets a directory index that is the page itself, never a redirect to it', async () => {
  const files = ['explanation/pipeline.html', 'explanation/pipeline/stages.html', 'explanation/guardrails.html']
  await withSite(files, async (outDir) => {
    const routesPaths = ['/fr/', '/fr/explanation/pipeline', '/fr/explanation/pipeline/stages', '/fr/explanation/guardrails']
    await writeDirectoryIndexes({ routesPaths, baseUrl: '/fr/', outDir })
    const index = await readFile(join(outDir, 'explanation/pipeline/index.html'), 'utf8')
    assert.equal(index, '<html>explanation/pipeline.html</html>')
    await assert.rejects(stat(join(outDir, 'explanation/guardrails/index.html')))
    await assert.rejects(stat(join(outDir, 'explanation/pipeline/stages/index.html')))
  })
})

test('a directory that already has an index keeps it', async () => {
  await withSite(['how-to.html', 'how-to/index.html'], async (outDir) => {
    await writeDirectoryIndexes({ routesPaths: ['/how-to'], baseUrl: '/', outDir })
    assert.equal(await readFile(join(outDir, 'how-to/index.html'), 'utf8'), '<html>how-to/index.html</html>')
  })
})

test('the search page also answers at search/, where the search box sends "See all results"', async () => {
  await withSite(['search.html', 'fr/search.html'], async (outDir) => {
    await writeSearchFolderIndex({ outDir })
    await writeSearchFolderIndex({ outDir: join(outDir, 'fr') })
    assert.equal(await readFile(join(outDir, 'search/index.html'), 'utf8'), '<html>search.html</html>')
    assert.equal(await readFile(join(outDir, 'fr/search/index.html'), 'utf8'), '<html>fr/search.html</html>')
  })
})

test('a build without a search page gets no search folder', async () => {
  await withSite(['index.html'], async (outDir) => {
    await writeSearchFolderIndex({ outDir })
    await assert.rejects(stat(join(outDir, 'search')))
  })
})
