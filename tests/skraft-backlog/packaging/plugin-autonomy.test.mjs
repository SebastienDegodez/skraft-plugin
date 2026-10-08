// skraft-backlog installs on its own: nothing it ships may reach into another plugin.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseAgentDescriptor } from '../../../plugins/skraft-framework/src/cli/build-config.mjs'
import { projectPluginAdapters } from '../../../scripts/project-plugin-adapters.mjs'

const repo = fileURLToPath(new URL('../../../', import.meta.url))
const root = join(repo, 'plugins/skraft-backlog')
const read = (path) => readFileSync(join(root, path), 'utf8')
const json = (path) => JSON.parse(read(path))

const walk = (directory) => readdirSync(directory).flatMap((name) => {
  const path = join(directory, name)
  return statSync(path).isDirectory() ? walk(path) : [path]
})
const shipped = walk(root).map((path) => relative(root, path).split(sep).join('/'))
const markdown = shipped.filter((path) => path.endsWith('.md'))
const skills = readdirSync(join(root, 'skills')).filter((name) => existsSync(join(root, 'skills', name, 'SKILL.md')))

test('every relative Markdown link resolves to a file inside the plugin', () => {
  for (const path of markdown) {
    const text = read(path)
    for (const [, target] of text.matchAll(/\]\((?!https?:|#|mailto:)([^)\s]+?)(?:#[^)]*)?\)/g)) {
      const resolved = resolve(dirname(join(root, path)), target)
      assert.ok(!relative(root, resolved).startsWith('..'), `${path} links outside the plugin: ${target}`)
      assert.ok(existsSync(resolved), `${path} links to a missing file: ${target}`)
    }
  }
})

test('nothing shipped needs the engineering plugin at runtime', () => {
  for (const path of shipped.filter((p) => /\.(md|mjs|json)$/.test(p))) {
    const text = read(path)
    assert.doesNotMatch(text, /SKRAFT_PLUGIN_ROOT|skraft-framework\/|src\/cli\/(artifact|state|report)\.mjs/, path)
  }
})

test('every script a skill tells the agent to run ships in that skill', () => {
  for (const skill of skills) {
    const text = read(`skills/${skill}/SKILL.md`)
    for (const [, script] of text.matchAll(/node (?:\.\/)?(scripts\/[\w.-]+\.mjs)/g)) {
      assert.ok(existsSync(join(root, 'skills', skill, script)), `${skill} runs ${script}, which it does not ship`)
    }
  }
})

test('every skill an agent declares is a skill this plugin ships, named like its folder', () => {
  for (const skill of skills) {
    const name = /^name:\s*(.+)$/m.exec(read(`skills/${skill}/SKILL.md`))?.[1]?.trim()
    assert.equal(name, skill, `skills/${skill}/SKILL.md declares name ${name}`)
  }
  for (const file of readdirSync(join(root, 'com.github.copilot/agents'))) {
    const descriptor = parseAgentDescriptor(read(`com.github.copilot/agents/${file}`), { id: file })
    for (const skill of [...descriptor.skills, ...descriptor.onDemandSkills]) {
      assert.ok(skills.includes(skill), `${file} declares ${skill}, which skraft-backlog does not ship`)
    }
  }
})

test('the manifests name the same plugin and version, and the Claude manifest registers every agent', () => {
  const manifests = ['plugin.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json'].map(json)
  assert.equal(new Set(manifests.map((m) => m.name)).size, 1)
  assert.equal(manifests[0].name, 'skraft-backlog')
  assert.equal(new Set(manifests.map((m) => m.version)).size, 1)
  assert.equal(manifests[0].$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json')
  const native = readdirSync(join(root, 'com.anthropic.claude-code/agents')).map((f) => `./com.anthropic.claude-code/agents/${f}`).sort()
  assert.deepEqual([...manifests[1].agents].sort(), native)
})

test('the plugin ships no hooks: it guards nothing the engineering plugin guards', () => {
  assert.ok(!shipped.some((path) => path.startsWith('hooks/') || path.includes('/hooks/')), 'unexpected hook file')
})

test('both agent trees are in sync with their baseline', () => {
  const result = projectPluginAdapters({ pluginRoot: root, mode: 'check' })
  assert.equal(result.ok, true, JSON.stringify(result))
})

test('every marketplace lists the plugin from its own folder', () => {
  for (const path of ['.claude-plugin/marketplace.json', '.cursor-plugin/marketplace.json', '.github/plugin/marketplace.json', '.agents/plugins/marketplace.json']) {
    const entry = JSON.parse(readFileSync(join(repo, path), 'utf8')).plugins.find((plugin) => plugin.name === 'skraft-backlog')
    assert.ok(entry, `${path} does not list skraft-backlog`)
    assert.equal(typeof entry.source === 'string' ? entry.source : entry.source.path, './plugins/skraft-backlog', path)
  }
})

test('the version the refinement marker carries is the plugin version', async () => {
  const { VERSION } = await import('../../../plugins/skraft-backlog/skills/refinement-proposal/scripts/version.mjs')
  assert.equal(VERSION, json('plugin.json').version)
})
