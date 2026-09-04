import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { readFrontMatter } from '../../eng/lib/front-matter.mjs'

// A harness discovers agents by walking the plugin's `agents/` directory and treating
// every markdown file it finds as an agent descriptor. Anything parked there that is not
// an agent — a template, a note, a scratch file — is therefore published as a real,
// dispatchable agent with no description and, absent a `tools:` list, unrestricted tool
// access. That is exactly what five template files under `agents/assets/` did until they
// moved to the plugin's `assets/` directory.
//
// `eng/catalog/scan.mjs` never caught it because it filters on a suffix; the harness
// does not filter at all. These tests hold the directory to what the harness actually sees.
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '../..')
const pluginRoot = join(repoRoot, 'plugins/skraft-framework')
const agentsRoot = join(pluginRoot, 'com.anthropic.claude-code/agents')
const agentRuntimeRoots = [
  agentsRoot,
  join(pluginRoot, 'skills'),
  join(pluginRoot, 'com.github.copilot/rules'),
  join(pluginRoot, 'assets'),
]

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })

const markdownFiles = walk(agentsRoot).filter((path) => path.endsWith('.md'))
const fromRoot = (path) => relative(repoRoot, path).split('\\').join('/')
const userInvocableAgentIds = new Set([
  'skraft-orchestrator',
  'backlog-discoverer',
  'backlog-planner',
  'brownfield-analyst',
  'brownfield-harness-builder',
  'brownfield-refactorer',
])

test('agent-discovery: every descriptor uses .md without the .agent segment', () => {
  const strays = markdownFiles.filter((path) => path.endsWith('.agent.md')).map(fromRoot)
  assert.deepEqual(
    strays,
    [],
    'the descriptor loader keys identity on the file stem, so a .agent suffix leaks into the agent id',
  )
})

test('agent-discovery: every agent descriptor declares a description', () => {
  assert.ok(markdownFiles.length > 0, 'expected the plugin to ship agent descriptors')

  for (const path of markdownFiles) {
    const { data } = readFrontMatter(readFileSync(path, 'utf8'))
    const description = typeof data.description === 'string' ? data.description.trim() : ''
    assert.notEqual(description, '', `${fromRoot(path)}: agent declares no front-matter description`)
  }
})

test('agent-discovery: only standalone roots are user-invocable', () => {
  for (const path of markdownFiles) {
    const { data } = readFrontMatter(readFileSync(path, 'utf8'))
    const id = path.split('/').at(-1).replace(/\.md$/, '')
    const expected = userInvocableAgentIds.has(id)

    assert.equal(
      Object.hasOwn(data, 'userInvocable'),
      false,
      `${fromRoot(path)}: use native user-invocable front-matter spelling`,
    )
    assert.equal(
      data['user-invocable'],
      String(expected),
      `${fromRoot(path)}: user-invocable must be ${expected}`,
    )
  }
})

test('agent-discovery: no second agent tree competes with the Claude one', () => {
  assert.equal(existsSync(join(pluginRoot, 'agents')), false)
  assert.equal(existsSync(join(pluginRoot, 'instructions')), false)
  assert.equal(existsSync(join(pluginRoot, 'com.github.copilot/agents')), false)
})

test('agent-discovery: runtime prompts contain no vendor-specific upstream label', () => {
  const forbiddenLabel = new RegExp(['h', 'v', 'e'].join(''), 'i')
  const offenders = agentRuntimeRoots
    .flatMap(walk)
    .filter((path) => /\.(md|json)$/.test(path))
    .filter((path) => forbiddenLabel.test(readFileSync(path, 'utf8')))
    .map(fromRoot)

  assert.deepEqual(offenders, [])
})
