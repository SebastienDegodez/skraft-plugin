import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createInstructionFileReader } from '../../plugins/skraft-framework/src/adapters/infrastructure/instruction-file-reader.mjs'

const withPlugin = async (run) => {
  const root = await mkdtemp(join(tmpdir(), 'skraft-instruction-reader-'))
  try {
    const rules = join(root, 'com.github.copilot/rules')
    await mkdir(rules, { recursive: true })
    await writeFile(join(rules, 'artifact.instructions.md'), '# artifact')
    await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('instruction reader loads only packaged Copilot rules', async () => {
  await withPlugin(async (pluginRoot) => {
    const reader = createInstructionFileReader({ pluginRoot })
    assert.equal(
      await reader.read('plugins/skraft-framework/com.github.copilot/rules/artifact.instructions.md'),
      '# artifact',
    )
  })
})

test('instruction reader rejects absolute paths and traversal', async () => {
  await withPlugin(async (pluginRoot) => {
    const reader = createInstructionFileReader({ pluginRoot })
    await assert.rejects(() => reader.read('/tmp/com.github.copilot/rules/artifact.instructions.md'))
    await assert.rejects(() => reader.read('com.github.copilot/rules/../../secret.md'))
    await assert.rejects(() => reader.read('other/instructions.md'))
  })
})
