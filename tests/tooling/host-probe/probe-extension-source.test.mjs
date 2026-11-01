import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { probeCanvasSource, probeExtensionSource } from '../../../eng/host-probe/fixtures.mjs'

for (const [name, source] of [['probe extension', probeExtensionSource('a')], ['canvas extension', probeCanvasSource]]) {
  test(`the ${name} the host loads is a module Node can parse: a syntax error would fail it at once`, (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'skraft-probe-source-'))
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    const file = join(dir, 'extension.mjs')
    writeFileSync(file, source)

    const checked = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })

    assert.equal(checked.status, 0, checked.stderr)
  })
}
