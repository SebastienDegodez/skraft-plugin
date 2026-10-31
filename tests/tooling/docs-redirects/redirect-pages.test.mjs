import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  redirectPage,
  writeDirectoryIndexes,
} from '../../../docs/website/plugins/redirects/redirect-pages.mjs'

const withSite = async (files, run) => {
  const outDir = await mkdtemp(join(tmpdir(), 'skraft-redirects-'))
  try {
    for (const file of files) {
      await mkdir(join(outDir, file, '..'), { recursive: true })
      await writeFile(join(outDir, file), '<html></html>')
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

test('a French page with a same-named folder gets a directory index that redirects to the page', async () => {
  const files = ['explanation/pipeline.html', 'explanation/pipeline/stages.html', 'explanation/guardrails.html']
  await withSite(files, async (outDir) => {
    const routesPaths = ['/fr/', '/fr/explanation/pipeline', '/fr/explanation/pipeline/stages', '/fr/explanation/guardrails']
    await writeDirectoryIndexes({ routesPaths, baseUrl: '/fr/', outDir })
    const index = await readFile(join(outDir, 'explanation/pipeline/index.html'), 'utf8')
    assert.match(index, /location\.replace\("\/fr\/explanation\/pipeline"/)
    await assert.rejects(stat(join(outDir, 'explanation/guardrails/index.html')))
    await assert.rejects(stat(join(outDir, 'explanation/pipeline/stages/index.html')))
  })
})

test('a directory that already has an index keeps it', async () => {
  await withSite(['how-to.html', 'how-to/index.html'], async (outDir) => {
    await writeDirectoryIndexes({ routesPaths: ['/how-to'], baseUrl: '/', outDir })
    assert.equal(await readFile(join(outDir, 'how-to/index.html'), 'utf8'), '<html></html>')
  })
})
