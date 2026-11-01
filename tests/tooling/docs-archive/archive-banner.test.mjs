import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { bannerTree, indexHtml, withBanner } from '../../../eng/docs/archive-banner.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'eng', 'docs', 'archive-banner.mjs')

const withDir = (run) => {
  const root = mkdtempSync(join(tmpdir(), 'skraft-archive-'))
  try {
    return run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const PAGE = '<!doctype html><html><head><title>x</title></head><body class="page"><main>v1</main></body></html>'

test('the banner sits right after <body> and links to the current documentation', () => {
  const html = withBanner(PAGE, 'v1.15.3', '/skraft-plugin/')
  assert.match(html, /<body class="page"><div id="skraft-archive-banner"[^>]*>Archived documentation for skraft v1\.15\.3\. <a href="\/skraft-plugin\/"/)
  assert.ok(html.endsWith('<main>v1</main></body></html>'))
})

test('a page banners once, and a fragment without <body> stays untouched', () => {
  const once = withBanner(PAGE, 'v1.15.3', '/skraft-plugin/')
  assert.equal(withBanner(once, 'v1.15.3', '/skraft-plugin/'), once)
  assert.equal(withBanner('<div>partial</div>', 'v1.15.3', '/skraft-plugin/'), '<div>partial</div>')
})

test('a tag or a base path that is not plain is refused rather than written into the page', () => {
  assert.throws(() => withBanner(PAGE, 'v1.15.3"><script>', '/skraft-plugin/'), /not a v1 release tag/)
  assert.throws(() => withBanner(PAGE, 'v1.15.3', 'https://evil.example/'), /not a base path/)
  assert.throws(() => indexHtml('/skraft-plugin', ['v1.15.3']), /not a base path/)
})

test('every .html page of a tree gets the banner, other files do not', () => {
  withDir((root) => {
    mkdirSync(join(root, 'fr', 'how-to'), { recursive: true })
    writeFileSync(join(root, 'index.html'), PAGE)
    writeFileSync(join(root, 'fr', 'how-to', 'gates.html'), PAGE)
    writeFileSync(join(root, 'style.css'), 'body{}')
    assert.equal(bannerTree(root, 'v1.14.1', '/skraft-plugin/'), 2)
    assert.match(readFileSync(join(root, 'fr', 'how-to', 'gates.html'), 'utf8'), /skraft v1\.14\.1/)
    assert.equal(readFileSync(join(root, 'style.css'), 'utf8'), 'body{}')
    assert.equal(bannerTree(root, 'v1.14.1', '/skraft-plugin/'), 0)
  })
})

test('the CLI banners a tree and writes v1/index.html listing each archived tree in order', () => {
  withDir((root) => {
    mkdirSync(join(root, 'v1.15.3'))
    writeFileSync(join(root, 'v1.15.3', 'index.html'), PAGE)
    const banner = spawnSync(process.execPath, [SCRIPT, 'banner', join(root, 'v1.15.3'), '--tag', 'v1.15.3', '--current', '/skraft-plugin/'], { encoding: 'utf8' })
    assert.equal(banner.status, 0, banner.stderr)
    const index = spawnSync(process.execPath, [SCRIPT, 'index', root, '--base', '/skraft-plugin/', '--tags', 'v1.15.3,v1.11.0'], { encoding: 'utf8' })
    assert.equal(index.status, 0, index.stderr)
    const list = readFileSync(join(root, 'v1', 'index.html'), 'utf8')
    assert.ok(list.indexOf('href="/skraft-plugin/v1.15.3/"') < list.indexOf('href="/skraft-plugin/v1.11.0/"'))
    assert.match(readFileSync(join(root, 'v1.15.3', 'index.html'), 'utf8'), /id="skraft-archive-banner"/)
  })
})

test('the CLI refuses an incomplete command', () => {
  const run = spawnSync(process.execPath, [SCRIPT, 'banner', 'somewhere'], { encoding: 'utf8' })
  assert.equal(run.status, 2)
  assert.match(run.stderr, /^Usage:/)
})
