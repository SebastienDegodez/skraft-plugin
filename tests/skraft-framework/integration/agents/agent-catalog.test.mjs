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
  assert.equal(await agentCatalog.locate('acme/../../evil'), null)
  assert.equal(await agentCatalog.locate('Upper'), null)
  assert.equal(await agentCatalog.locate(''), null)
})

test('each host finds only the agents it can start: Claude Code those of .claude/agents/, Copilot those of .github/agents/', async (t) => {
  const cwd = tempFolder(t)
  const pluginRoot = tempFolder(t)
  agentFile(cwd, '.claude', 'agents', 'acme-claude-reviewer.md')
  agentFile(cwd, '.github', 'agents', 'acme-copilot-reviewer.agent.md')
  agentFile(cwd, '.github', 'agents', 'acme-plain-reviewer.md')
  agentFile(pluginRoot, 'com.github.copilot', 'agents', 'copilot-only.agent.md')
  agentFile(pluginRoot, 'com.anthropic.claude-code', 'agents', 'claude-only.md')
  const claude = createNodeAdapters({ cwd, pluginRoot, agentHost: 'claude-code' }).agentCatalog
  const copilot = createNodeAdapters({ cwd, pluginRoot, agentHost: 'copilot' }).agentCatalog

  assert.deepEqual(
    await Promise.all(['acme-claude-reviewer', 'acme-copilot-reviewer', 'acme-plain-reviewer', 'claude-only', 'copilot-only'].map((id) => claude.locate(id))),
    ['repository', null, null, 'plugin', null],
  )
  assert.deepEqual(
    await Promise.all(['acme-claude-reviewer', 'acme-copilot-reviewer', 'acme-plain-reviewer', 'claude-only', 'copilot-only'].map((id) => copilot.locate(id))),
    [null, 'repository', 'repository', null, 'plugin'],
  )
})

test('the skills an agent lists under skills: are found in the plugin first, then in the working copy; one found nowhere is reported missing', async (t) => {
  const cwd = tempFolder(t)
  const pluginRoot = tempFolder(t)
  const skill = (root, ...parts) => {
    mkdirSync(join(root, ...parts), { recursive: true })
    writeFileSync(join(root, ...parts, 'SKILL.md'), `# ${parts.at(-1)}\n`)
  }
  skill(pluginRoot, 'skills', 'review-criteria')
  skill(cwd, '.github', 'skills', 'acme-rules')
  skill(cwd, '.claude', 'skills', 'review-criteria')
  mkdirSync(join(pluginRoot, 'com.anthropic.claude-code', 'agents'), { recursive: true })
  writeFileSync(join(pluginRoot, 'com.anthropic.claude-code', 'agents', 'acme-lens.md'), [
    '---', 'name: acme-lens', 'metadata:', '  skills:', '    - review-criteria', '    - acme-rules  # house rules', '    - nowhere', '    - ../escape', '  other: 1', '---', '# Acme lens',
  ].join('\n'))
  mkdirSync(join(cwd, '.claude', 'agents'), { recursive: true })
  writeFileSync(join(cwd, '.claude', 'agents', 'plain-lens.md'), '---\nname: plain-lens\n---\n# Plain\n')
  const { agentCatalog } = createNodeAdapters({ cwd, pluginRoot })

  assert.deepEqual(await agentCatalog.skills('acme-lens'), {
    found: [
      { name: 'review-criteria', path: join(pluginRoot, 'skills', 'review-criteria', 'SKILL.md'), text: '# review-criteria\n' },
      { name: 'acme-rules', path: join(cwd, '.github', 'skills', 'acme-rules', 'SKILL.md'), text: '# acme-rules\n' },
    ],
    missing: ['nowhere'],
  })
  const none = { found: [], missing: [] }
  assert.deepEqual(await agentCatalog.skills('plain-lens'), none)
  assert.deepEqual(await agentCatalog.skills('unknown-lens'), none)
  assert.deepEqual(await agentCatalog.skills('../acme-lens'), none)
})

test('every lens the plugin ships points its brief at a skill file that exists', async (t) => {
  const { agentCatalog } = createNodeAdapters({ cwd: tempFolder(t), pluginRoot: PLUGIN_ROOT })

  const located = async (agent) => (await agentCatalog.skills(agent)).found.map(({ name, path }) => ({ name, path }))
  assert.deepEqual(await located('consistency-lens'), [{ name: 'architecture-review-criteria', path: join(PLUGIN_ROOT, 'skills', 'architecture-review-criteria', 'SKILL.md') }])
  assert.deepEqual(await located('coverage-lens'), [{ name: 'acceptance-review-criteria', path: join(PLUGIN_ROOT, 'skills', 'acceptance-review-criteria', 'SKILL.md') }])
})
