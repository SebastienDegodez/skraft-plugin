import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FW_ROOT = fileURLToPath(new URL('../', import.meta.url))
const DOMAIN_DIR = join(FW_ROOT, 'domain')

async function collectMjsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) files.push(...await collectMjsFiles(full))
    else if (e.name.endsWith('.mjs')) files.push(full)
  }
  return files
}

test('AC2: domain/ has no imports from hook protocol or driver ports', async () => {
  const files = await collectMjsFiles(DOMAIN_DIR)
  assert.ok(files.length > 0, 'domain/ must contain at least one .mjs file')
  for (const file of files) {
    const src = await readFile(file, 'utf8')
    const forbidden = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)]
      .map(m => m[1])
      .filter(p => p.includes('adapters/drivers/hooks') || p.includes('ports/driver'))
    assert.deepEqual(forbidden, [],
      `${file} must not import hook protocol: found [${forbidden.join(', ')}]`)
  }
})
