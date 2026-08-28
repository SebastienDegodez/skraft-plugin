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

test('plugin packaging: portable manifest remains inside Agent Plugins 1.0 closed schema', () => {
  assert.equal(portable.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json')
  assert.deepEqual(Object.keys(portable).filter((key) => !PORTABLE_FIELDS.has(key)), [])
  assert.deepEqual(portable.extensions, { 'com.github.copilot': {} })
})

test('plugin packaging: Agent Plugins Copilot conventions resolve', () => {
  for (const path of [
    'com.github.copilot/agents',
    'com.github.copilot/rules',
    'com.github.copilot/hooks/hooks.json',
  ]) {
    assert.equal(existsSync(join(pluginRoot, path)), true, path)
  }
})

test('plugin packaging: Claude manifest points at native agent and hook adapters', () => {
  assert.equal(claude.agents, './com.anthropic.claude-code/agents')
  assert.equal(claude.hooks, './com.anthropic.claude-code/hooks/hooks.json')
  assert.equal(existsSync(join(pluginRoot, claude.agents)), true)
  assert.equal(existsSync(join(pluginRoot, claude.hooks)), true)
})

test('plugin packaging: Copilot compatibility hook remains shipped at root', () => {
  const namespaced = readFileSync(join(pluginRoot, 'com.github.copilot/hooks/hooks.json'), 'utf8')
  const compatibility = readFileSync(join(pluginRoot, 'hooks/hooks.json'), 'utf8')
  assert.equal(compatibility, namespaced)
})
