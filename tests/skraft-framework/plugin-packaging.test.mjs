import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = join(here, '../../plugins/skraft-framework')
const portable = JSON.parse(readFileSync(join(pluginRoot, 'plugin.json'), 'utf8'))
const claude = JSON.parse(readFileSync(join(pluginRoot, '.claude-plugin/plugin.json'), 'utf8'))

const PORTABLE_FIELDS = new Set([
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

// VS Code resolves a plugin format in a fixed order: Agent Plugins v1 (root plugin.json
// carrying the agent-plugins.org $schema) wins over .plugin/plugin.json, which wins over
// .claude-plugin/plugin.json. The Agent Plugins v1 adapter declares no plugin-root token
// and injects no plugin-root env var, so a hook command can never locate its own package —
// it resolves against the workspace and the CLI is invoked on a path that does not exist.
// Until that adapter substitutes a root, the portable manifest must stay unrecognized so
// detection falls through to Claude, which does interpolate ${CLAUDE_PLUGIN_ROOT}.
test('plugin packaging: portable manifest does not claim the Agent Plugins schema', () => {
  assert.equal(
    portable.$schema,
    undefined,
    'an agent-plugins.org $schema promotes the package to the Agent Plugins v1 adapter, which resolves hook commands without a plugin root',
  )
  assert.deepEqual(Object.keys(portable).filter((key) => !PORTABLE_FIELDS.has(key)), [])
  assert.deepEqual(portable.extensions, { 'com.github.copilot': {} })
})

// The rules tree is the last Copilot-namespaced asset the plugin ships. It has no
// Claude-native mirror, so it is kept where it is and reached through the Claude manifest.
test('plugin packaging: the Copilot rules directory remains shipped', () => {
  assert.equal(existsSync(join(pluginRoot, 'com.github.copilot/rules')), true)
})

// The Claude adapter carries no built-in component map, so every directory it must read is
// named by this manifest. Rules have no Claude-native mirror: the manifest is the only thing
// that keeps the instruction files loading once detection lands on Claude.
test('plugin packaging: Claude manifest points at the agent and rule adapters', () => {
  assert.equal(claude.agents, './com.anthropic.claude-code/agents')
  assert.equal(claude.rules, './com.github.copilot/rules')
  assert.equal(existsSync(join(pluginRoot, claude.agents)), true)
  assert.equal(existsSync(join(pluginRoot, claude.rules)), true)
})

// Hooks are the one component that is NOT pointed at. hooks/hooks.json is loaded on its own
// by every harness — the Claude adapter tries it before any pointer, and the Copilot CLI reads
// that path and nothing else — so `hooks` in a manifest names an ADDITIONAL file. Declaring the
// standard path there is how the same guardrail gets registered twice and fires twice.
test('plugin packaging: no manifest declares a hooks pointer', () => {
  assert.equal(existsSync(join(pluginRoot, 'hooks/hooks.json')), true)
  for (const manifest of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', 'plugin.json']) {
    const declared = JSON.parse(readFileSync(join(pluginRoot, manifest), 'utf8')).hooks
    assert.equal(declared, undefined, `${manifest} declares a hooks pointer`)
  }
})

// A second manifest anywhere else is a silent double-registration on the harnesses that read
// it, and dead weight on the ones that do not: the Copilot CLI ignores both of these paths —
// measured against CLI 1.0.80, hooks under com.github.copilot/ never fire.
test('plugin packaging: no second hook manifest ships', () => {
  for (const path of ['.plugin/plugin.json', 'com.github.copilot/hooks/hooks.json', 'com.anthropic.claude-code/hooks/hooks.json']) {
    assert.equal(existsSync(join(pluginRoot, path)), false, path)
  }
})
