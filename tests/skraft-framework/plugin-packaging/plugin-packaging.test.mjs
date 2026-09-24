import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAgentFrontmatter } from '../../../plugins/skraft-framework/src/cli/resolve-model.mjs'
import { buildProjection, projectPluginAdapters } from '../../../scripts/project-plugin-adapters.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = join(here, '../../../plugins/skraft-framework')
const portable = JSON.parse(readFileSync(join(pluginRoot, 'plugin.json'), 'utf8'))
const claude = JSON.parse(readFileSync(join(pluginRoot, '.claude-plugin/plugin.json'), 'utf8'))

const PORTABLE_FIELDS = new Set([
  '$schema',
  'name',
  'version',
  'description',
  'author',
  'homepage',
  'repository',
  'license',
  'keywords',
  'extensions',
])

// Agent Plugins v1 has a closed top-level schema; agents and hooks are namespaced assets.
test('plugin packaging: portable manifest declares the exact v1 schema and only permitted fields', () => {
  assert.equal(
    portable.$schema,
    'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
  )
  assert.equal(typeof portable.name, 'string')
  assert.ok(portable.name.length > 0)
  assert.deepEqual(Object.keys(portable).filter((key) => !PORTABLE_FIELDS.has(key)), [])
  assert.equal(Object.hasOwn(portable, 'agents'), false)
  assert.deepEqual(portable.extensions, { 'com.github.copilot': {} })
})

// The orchestrator carries its state rules in its descriptor; no path-scoped rules ship.
test('plugin packaging: no Copilot rules directory ships', () => {
  assert.equal(existsSync(join(pluginRoot, 'com.github.copilot/rules')), false)
})

// Claude's agents field accepts Markdown file paths, not a directory. Enumerate every
// native descriptor, including workers and lenses regardless of visibility metadata.
test('plugin packaging: Claude manifest enumerates every native agent exactly once', () => {
  const agentsRoot = 'com.anthropic.claude-code/agents'
  const expected = readdirSync(join(pluginRoot, agentsRoot), { recursive: true })
    .filter((path) => path.endsWith('.md'))
    .map((path) => `./com.anthropic.claude-code/agents/${path.replaceAll('\\', '/').split('/').at(-1)}`)
    .sort()
  assert.equal(expected.length, 31)
  assert.ok(Array.isArray(claude.agents), 'agents must be an array of Markdown file paths')
  assert.deepEqual([...claude.agents].sort(), expected)
})

test('plugin packaging: namespaced adapters match the generator byte for byte', () => {
  const result = projectPluginAdapters({ pluginRoot, mode: 'check' })
  assert.equal(result.ok, true, JSON.stringify(result))
  for (const { source, target, content } of buildProjection(pluginRoot).files) {
    assert.deepEqual(readFileSync(join(pluginRoot, target)), content, `${target}: differs from ${source}`)
  }
})

// CLI discovery rejects the VS Code-only model fallback-array syntax.
test('plugin packaging: shared agents use scalar models accepted by CLI discovery', () => {
  for (const path of claude.agents) {
    const { model } = parseAgentFrontmatter(readFileSync(join(pluginRoot, path), 'utf8'))
    assert.equal(typeof model, 'string', `${path}: model fallback arrays are VS Code-only`)
    assert.ok(model.trim().length > 0, `${path}: model must not be empty`)
  }
})

test('plugin packaging: Claude manifest points at the agent adapters and no rules', () => {
  assert.equal(Object.hasOwn(claude, 'rules'), false)
  for (const path of claude.agents) assert.equal(existsSync(join(pluginRoot, path)), true)
})

// Claude loads root hooks by convention; Copilot v1 loads the namespaced copy.
// Neither manifest needs an additional hooks pointer.
test('plugin packaging: no manifest declares a hooks pointer', () => {
  assert.equal(existsSync(join(pluginRoot, 'hooks/hooks.json')), true)
  for (const manifest of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', 'plugin.json']) {
    const declared = JSON.parse(readFileSync(join(pluginRoot, manifest), 'utf8')).hooks
    assert.equal(declared, undefined, `${manifest} declares a hooks pointer`)
  }
})

test('plugin packaging: namespaced hooks preserve Claude shape and plugin-root commands', () => {
  const source = readFileSync(join(pluginRoot, 'hooks/hooks.json'))
  assert.deepEqual(readFileSync(join(pluginRoot, 'com.github.copilot/hooks/hooks.json')), source)
  const manifest = JSON.parse(source.toString('utf8'))
  assert.deepEqual(Object.keys(manifest), ['hooks'])
  assert.ok(manifest.hooks.SessionStart?.length > 0)
  assert.ok(manifest.hooks.PreToolUse?.length > 0)
  for (const [event, groups] of Object.entries(manifest.hooks)) {
    assert.match(event, /^[A-Z]/)
    assert.ok(Array.isArray(groups) && groups.length > 0)
    for (const group of groups) {
      assert.ok(Array.isArray(group.hooks) && group.hooks.length > 0)
      for (const hook of group.hooks) {
        assert.equal(hook.type, 'command')
        assert.match(hook.command, /\$\{CLAUDE_PLUGIN_ROOT\}/)
      }
    }
  }
})

test('plugin packaging: no legacy fallback or extra Claude hook manifest ships', () => {
  for (const path of ['.plugin/plugin.json', 'com.anthropic.claude-code/hooks/hooks.json']) {
    assert.equal(existsSync(join(pluginRoot, path)), false, path)
  }
})
