import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createNodeAdapters } from '../../../../plugins/skraft-framework/engine/infrastructure/node-adapters.mjs'
import { PLUGIN_ROOT, tempFolder } from '../support/workspace.mjs'

/** @param {string} root @param {string[]} parts */
const agentFile = (root, ...parts) => {
  mkdirSync(join(root, ...parts.slice(0, -1)), { recursive: true })
  writeFileSync(join(root, ...parts), '---\nname: agent\n---\n')
}

test('an agent skraft ships comes from the plugin; one the working copy defines comes from the repository', async (t) => {
  const cwd = tempFolder(t)
  agentFile(cwd, '.claude', 'agents', 'acme-security-reviewer.md')
  agentFile(cwd, '.github', 'agents', 'acme-copilot-reviewer.agent.md')
  agentFile(cwd, '.github', 'agents', 'acme-plain-reviewer.md')
  agentFile(cwd, '.claude', 'agents', 'solution-researcher.md')
  const { agentCatalog } = createNodeAdapters({ cwd, pluginRoot: PLUGIN_ROOT })

  assert.equal(await agentCatalog.locate('solution-researcher'), 'plugin')
  assert.equal(await agentCatalog.locate('acme-security-reviewer'), 'repository')
  assert.equal(await agentCatalog.locate('acme-copilot-reviewer'), 'repository')
  assert.equal(await agentCatalog.locate('acme-plain-reviewer'), 'repository')
  assert.equal(await agentCatalog.locate('acme-unknown'), null)
})

test('an agent shipped in only one of the plugin trees still comes from the plugin', async (t) => {
  const cwd = tempFolder(t)
  const pluginRoot = tempFolder(t)
  agentFile(pluginRoot, 'com.github.copilot', 'agents', 'copilot-only.agent.md')
  agentFile(pluginRoot, 'com.anthropic.claude-code', 'agents', 'claude-only.md')
  const { agentCatalog } = createNodeAdapters({ cwd, pluginRoot })

  assert.equal(await agentCatalog.locate('copilot-only'), 'plugin')
  assert.equal(await agentCatalog.locate('claude-only'), 'plugin')
})

test('a name that is not a kebab-case agent id is never looked up as a path', async (t) => {
  const cwd = tempFolder(t)
  agentFile(cwd, '.claude', 'evil.md')
  agentFile(cwd, '.claude', 'agents', 'Upper.md')
  const { agentCatalog } = createNodeAdapters({ cwd, pluginRoot: PLUGIN_ROOT })

  assert.equal(await agentCatalog.locate('../evil'), null)
  assert.equal(await agentCatalog.locate('Upper'), null)
  assert.equal(await agentCatalog.locate(''), null)
})
