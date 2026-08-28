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
// `eng/catalog/scan.mjs` never caught it because it filters on `.agent.md`; the harness
// does not filter at all. These tests hold the directory to what the harness actually sees.
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '../..')
const pluginRoot = join(repoRoot, 'plugins/skraft-framework')
const copilotAgentsRoot = join(pluginRoot, 'com.github.copilot/agents')
const claudeAgentsRoot = join(pluginRoot, 'com.anthropic.claude-code/agents')

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })

const copilotMarkdownFiles = walk(copilotAgentsRoot).filter((path) => path.endsWith('.md'))
const claudeMarkdownFiles = walk(claudeAgentsRoot).filter((path) => path.endsWith('.md'))
const fromRoot = (path) => relative(repoRoot, path).split('\\').join('/')
const relativeTo = (root, path) => relative(root, path).split('\\').join('/')

test('agent-discovery: every Copilot markdown file uses the native .agent.md suffix', () => {
  const strays = copilotMarkdownFiles.filter((path) => !path.endsWith('.agent.md')).map(fromRoot)
  assert.deepEqual(
    strays,
    [],
    'a harness publishes these as agents with no description and unrestricted tools — ' +
      'move non-agent markdown to the plugin\'s assets/ directory',
  )
})

test('agent-discovery: every Claude markdown file uses .md without the .agent segment', () => {
  const strays = claudeMarkdownFiles.filter((path) => path.endsWith('.agent.md')).map(fromRoot)
  assert.deepEqual(strays, [])
})

test('agent-discovery: Copilot and Claude trees have identical content and relative identities', () => {
  const copilot = new Map(copilotMarkdownFiles.map((path) => [
    relativeTo(copilotAgentsRoot, path).replace(/\.agent\.md$/, '.md'),
    readFileSync(path, 'utf8'),
  ]))
  const claude = new Map(claudeMarkdownFiles.map((path) => [
    relativeTo(claudeAgentsRoot, path),
    readFileSync(path, 'utf8'),
  ]))

  assert.deepEqual([...claude.keys()].sort(), [...copilot.keys()].sort())
  for (const [path, content] of copilot) {
    assert.equal(claude.get(path), content, `${path}: Claude mirror drifted from Copilot source`)
  }
})

test('agent-discovery: every agent descriptor declares a description', () => {
  assert.ok(copilotMarkdownFiles.length > 0, 'expected the plugin to ship agent descriptors')

  for (const path of copilotMarkdownFiles) {
    const { data } = readFrontMatter(readFileSync(path, 'utf8'))
    const description = typeof data.description === 'string' ? data.description.trim() : ''
    assert.notEqual(description, '', `${fromRoot(path)}: agent declares no front-matter description`)
  }
})

test('agent-discovery: generic agent and instruction roots no longer exist', () => {
  assert.equal(existsSync(join(pluginRoot, 'agents')), false)
  assert.equal(existsSync(join(pluginRoot, 'instructions')), false)
})
