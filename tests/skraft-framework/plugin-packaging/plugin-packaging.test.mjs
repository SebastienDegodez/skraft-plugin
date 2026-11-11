import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAgentFrontmatter } from '../../../plugins/skraft-framework/src/cli/resolve-model.mjs'
import { parseYaml } from '../../../plugins/skraft-framework/src/domain/yaml-parser.mjs'
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

// Claude loads root hooks by convention; Copilot v1 loads the namespaced copy.
// Neither manifest needs an additional hooks pointer.
test('plugin packaging: no manifest declares a hooks pointer', () => {
  assert.equal(existsSync(join(pluginRoot, 'hooks/hooks.json')), true)
  for (const manifest of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', 'plugin.json']) {
    const declared = JSON.parse(readFileSync(join(pluginRoot, manifest), 'utf8')).hooks
    assert.equal(declared, undefined, `${manifest} declares a hooks pointer`)
  }
})

// VS Code detects the v1 manifest, loads the namespaced copy and interpolates only
// ${PLUGIN_ROOT}; a literal ${CLAUDE_PLUGIN_ROOT} there sends node to /src/cli/hook.mjs.
test('plugin packaging: namespaced hooks preserve Claude shape and resolve each surface root', () => {
  const source = readFileSync(join(pluginRoot, 'hooks/hooks.json'), 'utf8')
  const copy = readFileSync(join(pluginRoot, 'com.github.copilot/hooks/hooks.json'), 'utf8')
  assert.equal(copy, source.replaceAll('${CLAUDE_PLUGIN_ROOT}', '${PLUGIN_ROOT}'))
  for (const [text, root, foreign] of [[source, 'CLAUDE_PLUGIN_ROOT', /\$\{PLUGIN_ROOT\}/], [copy, 'PLUGIN_ROOT', /CLAUDE_PLUGIN_ROOT/]]) {
    const manifest = JSON.parse(text)
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
          assert.ok(hook.command.includes(`"\${${root}}/src/cli/`), `${event}: ${hook.command}`)
          assert.doesNotMatch(hook.command, foreign)
        }
      }
    }
  }
})

test('plugin packaging: no legacy fallback or extra Claude hook manifest ships', () => {
  for (const path of ['.plugin/plugin.json', 'com.anthropic.claude-code/hooks/hooks.json']) {
    assert.equal(existsSync(join(pluginRoot, path)), false, path)
  }
})

test('native author capabilities: research and design can execute while retaining native editing', () => {
  for (const id of ['solution-researcher', 'solution-architect']) {
    for (const [tree, suffix, execution, editing] of [
      ['com.github.copilot/agents', '.agent.md', 'execute/runInTerminal', 'edit/editFiles'],
      ['com.anthropic.claude-code/agents', '.md', 'Bash', 'Edit'],
    ]) {
      const text = readFileSync(join(pluginRoot, tree, id + suffix), 'utf8')
      const data = parseYaml(text.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1])
      assert.ok(data.tools.includes(execution), `${id}: missing native ${execution}`)
      assert.ok(data.tools.includes(editing), `${id}: lost existing editing`)
      assert.doesNotMatch(text, /tools:\s*["']?\*/)
    }
  }
})

test('review ownership: parent renders returned verdict before recording state', () => {
  for (const [tree, file] of [
    ['com.github.copilot/agents', 'skraft-orchestrator.agent.md'],
    ['com.anthropic.claude-code/agents', 'skraft-orchestrator.md'],
  ]) {
    const text = readFileSync(join(pluginRoot, tree, file), 'utf8')
    assert.match(text, /Render only the reviewer's returned canonical YAML/)
    assert.match(text, /No successful rendering and file verification means no `record-verdict`/)
    assert.match(text, /On schema failure, pass the[\s\S]*?renderer error to the reviewer/)
    for (const basename of ['design-review-{N}.md', 'distill-review-{N}.md', 'deliver-review-{N}.md']) {
      assert.ok(text.includes(basename), `${file}: missing exact ${basename}`)
    }
    assert.match(text, /qg-verify\.mjs/)
    assert.match(text, /if changed, prepare fresh inputs and re-dispatch/)
  }
})

test('DESIGN dispatch requires every architecture artefact before review', () => {
  for (const [tree, file] of [
    ['com.github.copilot/agents', 'skraft-orchestrator.agent.md'],
    ['com.anthropic.claude-code/agents', 'skraft-orchestrator.md'],
  ]) {
    const text = readFileSync(join(pluginRoot, tree, file), 'utf8')
    const designRow = text.split(/\r?\n/).find((line) => line.startsWith('| DESIGN |'))
    assert.ok(designRow, `${file}: missing DESIGN dispatch row`)
    for (const path of [
      'details/{date}/event-model-*.md',
      'details/{date}/diagrams-*.md',
      'details/{date}/contracts-*.md',
      'details/{date}/context-map.md',
      'details/{date}/consistency-matrix-{story}.md',
    ]) {
      assert.ok(designRow.includes(path), `${file}: missing required DESIGN artefact ${path}`)
    }
  }
})

test('native review capabilities: reviewers and lenses have no file-write or general execution tools', () => {
  for (const [tree, suffix, forbidden] of [
    ['com.github.copilot/agents', '.agent.md', /^(?:edit|execute)(?:\/|$)/],
    ['com.anthropic.claude-code/agents', '.md', /^(?:Write|Edit|Bash|TaskOutput|TaskStop)$/],
  ]) {
    const ids = readdirSync(join(pluginRoot, tree)).filter((file) => /(?:reviewer|lens)(?:\.agent)?\.md$/.test(file))
    for (const file of ids) {
      const text = readFileSync(join(pluginRoot, tree, file), 'utf8')
      const data = parseYaml(text.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1])
      assert.equal(data.tools.some((tool) => forbidden.test(tool)), false, `${file}: source mutation capability`)
      if (file.endsWith(`reviewer${suffix}`)) {
        assert.doesNotMatch(text, /node "\$SKRAFT_PLUGIN_ROOT\/src\/cli\/(?:artifact|qg-verify|structural-scan)\.mjs"/)
        assert.match(text, /orchestrator/i)
      }
      if (file === `solution-architect-reviewer${suffix}`) {
        assert.match(text, /If missing or unreadable, report a G1 BLOCKER and never return `APPROVED`/)
      }
    }
  }
})
