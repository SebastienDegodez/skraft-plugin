import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { expectedFiles, missingFiles } from '../../../eng/docs/check-build.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'eng', 'docs', 'check-build.mjs')

const withTree = (files, run) => {
  const root = mkdtempSync(join(tmpdir(), 'skraft-check-build-'))
  try {
    for (const file of files) {
      mkdirSync(dirname(join(root, ...file.split('/'))), { recursive: true })
      writeFileSync(join(root, ...file.split('/')), '<html></html>')
    }
    return run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const checkBuild = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })

const PREVIEW = ['404.html', 'index.html', 'fr/index.html']

test('a preview build needs the root page, the 404 page and the French root', () => {
  assert.deepEqual(expectedFiles(), ['404.html', 'index.html', 'fr/index.html'])
})

test('once 2.x is released, next is expected under next/ in both locales, with its llms.txt', () => {
  assert.deepEqual(expectedFiles({ released: ['2.x'], llms: true }), [
    '404.html', 'index.html', 'next/index.html', 'fr/index.html', 'fr/next/index.html',
    'llms.txt', 'next/llms.txt', 'fr/llms.txt', 'fr/next/llms.txt',
  ])
})

test('a deploy build also needs the dashboard, the v1 index and every archived tag', () => {
  const expected = expectedFiles({ dashboard: true, archive: ['v1.15.3', 'v1.11.0'] })
  assert.deepEqual(expected.slice(3), ['dashboard/index.html', 'v1/index.html', 'v1.15.3/index.html', 'v1.11.0/index.html'])
})

test('a complete preview build passes and lists what it examined', () => {
  withTree(PREVIEW, (root) => {
    const run = checkBuild(root)
    assert.equal(run.status, 0, run.stdout + run.stderr)
    assert.match(run.stdout, /ok {6}fr\/index\.html/)
    assert.match(run.stdout, /examined 3 paths under .*, 0 missing/)
  })
})

test('a build without fr/index.html fails and names the missing page', () => {
  withTree(['404.html', 'index.html'], (root) => {
    assert.deepEqual(missingFiles(root, expectedFiles()), ['fr/index.html'])
    const run = checkBuild(root)
    assert.equal(run.status, 1)
    assert.match(run.stdout, /missing fr\/index\.html/)
  })
})

test('a deploy build missing one archived tree fails on that tree only', () => {
  withTree([...PREVIEW, 'dashboard/index.html', 'v1/index.html', 'v1.15.3/index.html'], (root) => {
    const run = checkBuild(root, '--dashboard', '--archive', 'v1.15.3,v1.15.2')
    assert.equal(run.status, 1)
    assert.match(run.stdout, /missing v1\.15\.2\/index\.html/)
    assert.match(run.stdout, /examined 7 paths under .*, 1 missing/)
  })
})

test('the v1 archive alone is checked without the site pages', () => {
  withTree(['v1/index.html', 'v1.15.3/index.html', 'v1.11.0/index.html'], (root) => {
    const run = checkBuild(root, '--archive-only', '--archive', 'v1.15.3,v1.11.0')
    assert.equal(run.status, 0, run.stdout + run.stderr)
    assert.match(run.stdout, /examined 3 paths under .*, 0 missing/)
    assert.doesNotMatch(run.stdout, /404\.html/)
  })
})

test('a versions file listing 2.x makes next/ mandatory', () => {
  withTree(PREVIEW, (root) => {
    const versions = join(root, 'versions.json')
    writeFileSync(versions, JSON.stringify(['2.x']))
    const run = checkBuild(root, '--versions', versions)
    assert.equal(run.status, 1)
    assert.match(run.stdout, /missing next\/index\.html/)
    assert.match(run.stdout, /missing fr\/next\/index\.html/)
  })
})
