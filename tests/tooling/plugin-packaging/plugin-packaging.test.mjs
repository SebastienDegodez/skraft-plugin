import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAgentFrontmatter } from '../../../scripts/agent-policy/resolve-model.mjs'
import { parseYaml } from '../../../eng/lib/yaml-parser.mjs'
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
  assert.equal(expected.length, 20)
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

// V2 ships no command hooks: Claude Code reads the mod module, Copilot a manifest with an empty
// `hooks` object (a root-only manifest makes Copilot CLI 1.0.106-8 log an error at every session),
// and no manifest points at either.
test('plugin packaging: the hook manifest declares only the mod module, the Copilot copy declares no hook, no hooks pointer', () => {
  assert.deepEqual(JSON.parse(readFileSync(join(pluginRoot, 'hooks/hooks.json'), 'utf8')), { modules: ['./skraft-mod.tsx'] })
  assert.deepEqual(JSON.parse(readFileSync(join(pluginRoot, 'com.github.copilot/hooks/hooks.json'), 'utf8')), { hooks: {} })
  for (const manifest of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', 'plugin.json']) {
    const declared = JSON.parse(readFileSync(join(pluginRoot, manifest), 'utf8')).hooks
    assert.equal(declared, undefined, `${manifest} declares a hooks pointer`)
  }
})

test('plugin packaging: no legacy fallback or extra Claude hook manifest ships', () => {
  for (const path of ['.plugin/plugin.json', 'com.anthropic.claude-code/hooks/hooks.json']) {
    assert.equal(existsSync(join(pluginRoot, path)), false, path)
  }
})

test('native author capabilities: research and design retain execution and native editing', () => {
  for (const id of ['solution-researcher', 'solution-architect']) {
    for (const [tree, suffix, execution, editing] of [
      ['com.github.copilot/agents', '.agent.md', /^(?:execute|execute\/runInTerminal)$/, 'edit/editFiles'],
      ['com.anthropic.claude-code/agents', '.md', /^Bash$/, 'Edit'],
    ]) {
      const text = readFileSync(join(pluginRoot, tree, id + suffix), 'utf8')
      const data = parseYaml(text.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1])
      assert.ok(data.tools.some((tool) => execution.test(tool)), `${id}: missing native execution`)
      assert.ok(data.tools.includes(editing), `${id}: lost existing editing`)
    }
  }
})

test('native review capabilities: lenses and refuter cannot write files or run commands', () => {
  for (const plugin of ['skraft-framework', 'skraft-backlog']) {
    for (const [tree, forbidden] of [
      ['com.github.copilot/agents', /^(?:edit|execute|agent)(?:\/|$)/],
      ['com.anthropic.claude-code/agents', /^(?:Write|Edit|Bash|TaskOutput|TaskStop|Agent)(?:\(|$)/],
    ]) {
      const directory = join(pluginRoot, '..', plugin, tree)
      const files = readdirSync(directory).filter((file) => /(?:-lens|finding-refuter)(?:\.agent)?\.md$/.test(file))
      assert.ok(files.length > 0)
      for (const file of files) {
        const text = readFileSync(join(directory, file), 'utf8')
        const data = parseYaml(text.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1])
        assert.equal(data.tools.some((tool) => forbidden.test(tool)), false, `${plugin}/${file}: source mutation capability`)
      }
    }
  }
})

test('Copilot agents inherit model selection instead of pinning a model on any plugin', () => {
  for (const plugin of ['skraft-framework', 'skraft-backlog', 'skraft-brownfield']) {
    const directory = join(pluginRoot, '..', plugin, 'com.github.copilot/agents')
    for (const file of readdirSync(directory)) {
      const text = readFileSync(join(directory, file), 'utf8')
      const data = parseYaml(text.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1])
      assert.equal(data.model, undefined, `${plugin}/${file}: model belongs to configuration`)
    }
  }
})
