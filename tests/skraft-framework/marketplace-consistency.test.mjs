import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Four harnesses each read their own marketplace file, so a wrong `source` breaks install
// on that harness only — silently, and only for consumers, never in CI. These tests pin the
// two things that actually broke: `source` must designate the plugin directory itself (not
// its parent), and Codex must get its object form instead of the Claude/Cursor string form.
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '../..')

const MARKETPLACES = [
  { harness: 'claude-code', path: '.claude-plugin/marketplace.json' },
  { harness: 'cursor', path: '.cursor-plugin/marketplace.json' },
  { harness: 'copilot', path: '.github/plugin/marketplace.json' },
  { harness: 'codex', path: '.agents/plugins/marketplace.json' },
]

const read = (relPath) => JSON.parse(readFileSync(join(repoRoot, relPath), 'utf8'))

// Claude/Cursor/Copilot use a plain string; Codex wraps it in a source descriptor.
const pluginPathOf = (source) => (typeof source === 'string' ? source : source.path)

for (const { harness, path } of MARKETPLACES) {
  test(`marketplace-consistency: ${harness} source resolves to a real plugin directory`, () => {
    for (const entry of read(path).plugins) {
      const pluginPath = pluginPathOf(entry.source)
      assert.ok(pluginPath, `${path}: entry ${entry.name} declares no plugin path`)

      const resolved = join(repoRoot, pluginPath)
      assert.ok(
        existsSync(join(resolved, 'plugin.json')) || existsSync(join(resolved, '.claude-plugin/plugin.json')),
        `${path}: source "${pluginPath}" holds no plugin manifest — it must point at the plugin directory, not its parent`,
      )
    }
  })

  test(`marketplace-consistency: ${harness} entry names match the plugin manifest`, () => {
    for (const entry of read(path).plugins) {
      const manifest = read(join(pluginPathOf(entry.source), 'plugin.json'))
      assert.equal(entry.name, manifest.name, `${path}: entry name must match the plugin manifest name`)
    }
  })

  // `claude plugin validate` warns when the Claude marketplace declares no description,
  // and a marketplace with no description tells a browsing user nothing. The other three
  // harnesses render the same field, so hold all four to it rather than only the one the
  // Claude CLI happens to check.
  test(`marketplace-consistency: ${harness} declares a marketplace description`, () => {
    const description = read(path).metadata?.description
    assert.ok(
      typeof description === "string" && description.trim() !== "",
      `${path}: metadata.description is missing — a marketplace must say what it offers`,
    )
  })
}

test('marketplace-consistency: codex declares the source descriptor and install policy', () => {
  for (const entry of read('.agents/plugins/marketplace.json').plugins) {
    assert.equal(typeof entry.source, 'object', 'codex expects a source descriptor, not the Claude/Cursor string form')
    assert.equal(entry.source.source, 'local')
    assert.ok(entry.policy?.installation, 'codex requires policy.installation')
    assert.ok(entry.policy?.authentication, 'codex requires policy.authentication')
    assert.ok(entry.category, 'codex requires a category')
  }
})
