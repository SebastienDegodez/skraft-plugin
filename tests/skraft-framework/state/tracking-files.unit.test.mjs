// Unit — the phase gate's view of a project's tracking directory: a recorded path counts
// only when it names a file.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTrackingFiles } from '../../../plugins/skraft-framework/src/adapters/infrastructure/tracking-files.mjs'

test('tracking files: a recorded file exists and reads back; a directory or a missing path does not exist', async () => {
  const root = mkdtempSync(join(tmpdir(), 'skraft-tracking-files-'))
  try {
    mkdirSync(join(root, 'checkout-pricing', 'research'), { recursive: true })
    writeFileSync(join(root, 'checkout-pricing', 'research', 'findings.md'), '# Findings\n')
    const files = createTrackingFiles(root)

    assert.equal(await files.exists('checkout-pricing', 'research/findings.md'), true)
    assert.equal(await files.read('checkout-pricing', 'research/findings.md'), '# Findings\n')
    assert.equal(await files.exists('checkout-pricing', 'research'), false)
    assert.equal(await files.exists('checkout-pricing', 'design/adr.md'), false)
    assert.equal(await files.exists('other-project', 'research/findings.md'), false)
    await assert.rejects(files.read('checkout-pricing', 'design/adr.md'), { code: 'ENOENT' })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
