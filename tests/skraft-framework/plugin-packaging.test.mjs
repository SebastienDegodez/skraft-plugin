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

test('plugin packaging: Copilot component directories remain shipped', () => {
  for (const path of [
    'com.github.copilot/agents',
    'com.github.copilot/rules',
    'com.github.copilot/hooks/hooks.json',
  ]) {
    assert.equal(existsSync(join(pluginRoot, path)), true, path)
  }
})

// The Claude adapter carries no built-in component map, so every directory it must read is
// named by this manifest. Rules have no Claude-native mirror: the manifest is the only thing
// that keeps the instruction files loading once detection lands on Claude.
test('plugin packaging: Claude manifest points at the agent, rule and hook adapters', () => {
  assert.equal(claude.agents, './com.anthropic.claude-code/agents')
  assert.equal(claude.rules, './com.github.copilot/rules')
  assert.equal(claude.hooks, './com.anthropic.claude-code/hooks/hooks.json')
  assert.equal(existsSync(join(pluginRoot, claude.agents)), true)
  assert.equal(existsSync(join(pluginRoot, claude.rules)), true)
  assert.equal(existsSync(join(pluginRoot, claude.hooks)), true)
})

// Two files would silently re-route detection away from Claude. .plugin/plugin.json outranks
// .claude-plugin/plugin.json outright. hooks/hooks.json is the Claude adapter's own default
// hook path and is tried BEFORE the manifest pointer, so a Copilot-schema copy parked there
// parses as valid, wins, and reintroduces the uninterpolated ${CLAUDE_PLUGIN_ROOT}.
test('plugin packaging: no manifest shadows the Claude adapter', () => {
  for (const path of ['.plugin/plugin.json', 'hooks/hooks.json']) {
    assert.equal(existsSync(join(pluginRoot, path)), false, path)
  }
})
