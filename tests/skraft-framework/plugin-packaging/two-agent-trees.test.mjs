import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { projectPluginAdapters } from '../../../scripts/project-plugin-adapters.mjs'

const claude = 'com.anthropic.claude-code/agents'
const copilot = 'com.github.copilot/agents'
const header = (client, description = 'Shared') => `---\nname: ${client}\ndescription: ${description}\nmodel: ${client}-model\ntools: [${client}-tool]\nagents: [${client}-child]\n# Keep local\nmetadata:\n  private: ${client}\n---\n`
const put = (root, path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) }
const get = (root, path) => readFileSync(join(root, path), 'utf8')
const sync = (root, mode = 'apply') => projectPluginAdapters({ pluginRoot: root, mode })
function fixture(t) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'two-agent-trees-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  put(root, `${claude}/demo.md`, header('claude') + '[Child](child.md)\n[Skill](../../skills/demo/SKILL.md)\n')
  put(root, `${copilot}/demo.agent.md`, header('copilot') + '[Child](child.agent.md)\n[Skill](../../skills/demo/SKILL.md)\n')
  put(root, `${claude}/child.md`, header('claude') + 'Child\n')
  put(root, `${copilot}/child.agent.md`, header('copilot') + 'Child\n')
  put(root, 'skills/demo/SKILL.md', 'Skill')
  put(root, 'hooks/hooks.json', '{}\n')
  return root
}
const snapshot = (root) => readdirSync(root, { recursive: true, withFileTypes: true }).filter((e) => e.isFile())
  .map((e) => [join(e.parentPath, e.name), readFileSync(join(e.parentPath, e.name), 'utf8')]).sort()

for (const side of ['claude', 'copilot']) for (const field of ['body', 'description']) {
  test(`${side} ${field} edit crosses actual runtime pair with receiver headers and links intact`, (t) => {
    const root = fixture(t)
    sync(root)
    const path = side === 'claude' ? `${claude}/demo.md` : `${copilot}/demo.agent.md`
    const other = side === 'claude' ? `${copilot}/demo.agent.md` : `${claude}/demo.md`
    const before = get(root, other)
    put(root, path, field === 'body' ? get(root, path) + 'New rule.\n' : get(root, path).replace('description: Shared', 'description: Edited'))
    assert.equal(sync(root, 'check').ok, false)
    sync(root)
    assert.equal(get(root, other), field === 'body' ? before + 'New rule.\n' : before.replace('description: Shared', 'description: Edited'))
    assert.equal(sync(root, 'check').ok, true)
    assert.deepEqual(sync(root).written, [])
    assert.equal(existsSync(join(root, 'com.anthropic.claude-code/agent-sources')), false)
  })
}

for (const field of ['body', 'description']) test(`divergent ${field} edits block every write`, (t) => {
  const root = fixture(t)
  sync(root)
  for (const [path, side] of [[`${claude}/demo.md`, 'claude'], [`${copilot}/demo.agent.md`, 'copilot']]) {
    put(root, path, field === 'body' ? get(root, path) + side : get(root, path).replace('description: Shared', `description: ${side}`))
  }
  put(root, 'hooks/hooks.json', 'changed')
  const before = snapshot(root)
  assert.equal(sync(root, 'check').ok, false)
  assert.throws(() => sync(root), /conflict/i)
  assert.deepEqual(snapshot(root), before)
})

test('local native model/tools edits never trigger regeneration or baseline rewrite', (t) => {
  const root = fixture(t)
  sync(root)
  put(root, `${claude}/demo.md`, get(root, `${claude}/demo.md`).replace('claude-model', 'sonnet').replace('claude-tool', 'Read'))
  const before = snapshot(root)
  assert.equal(sync(root, 'check').ok, true)
  assert.deepEqual(sync(root).written, [])
  assert.deepEqual(snapshot(root), before)
})

test('new identity requires two explicitly authored descriptors, never inherited tools', (t) => {
  const root = fixture(t)
  sync(root)
  put(root, `${claude}/new.md`, header('claude') + 'New body')
  const before = snapshot(root)
  assert.throws(() => sync(root), /pair|counterpart/i)
  assert.deepEqual(snapshot(root), before)
  put(root, `${copilot}/new.agent.md`, header('copilot') + 'New body')
  sync(root)
  assert.equal(sync(root, 'check').ok, true)
})

test('explicit differential baseline preserves unchanged local prose; untracked divergence rejects', (t) => {
  const root = fixture(t)
  sync(root)
  const baseline = JSON.parse(get(root, '.agent-sync.json'))
  assert.equal(baseline.version, 2)
  put(root, `${claude}/child.md`, header('claude') + 'Native nuance\n')
  baseline.pairs.child.claude.body = 'Native nuance\n'
  put(root, '.agent-sync.json', JSON.stringify(baseline, null, 2) + '\n')
  const before = snapshot(root)
  assert.equal(sync(root, 'check').ok, true)
  assert.deepEqual(sync(root).written, [])
  assert.deepEqual(snapshot(root), before)
  rmSync(join(root, '.agent-sync.json'))
  assert.throws(() => sync(root), /bootstrap|baseline/i)
})

test('fieldwise edits and identical dual edits merge without changing native header spans', (t) => {
  const root = fixture(t)
  sync(root)
  const native = `${claude}/child.md`, cp = `${copilot}/child.agent.md`
  put(root, native, header('claude', 'Edited') + 'Child\n')
  put(root, cp, header('copilot') + 'New child\n')
  sync(root)
  assert.equal(get(root, native), header('claude', 'Edited') + 'New child\n')
  assert.equal(get(root, cp), header('copilot', 'Edited') + 'New child\n')
  for (const [path, client] of [[native, 'claude'], [cp, 'copilot']]) put(root, path, header(client, 'Same edit') + 'Same body\n')
  sync(root)
  assert.equal(sync(root, 'check').ok, true)
})

test('multiline description, BOM and CRLF retain exact local header bytes', (t) => {
  const root = fixture(t)
  const description = 'description: |\r\n  First\r\n\r\n  Second\r\n'
  const original = (client) => '\uFEFF---\r\nname: ' + client + '\r\n' + description + '# Keep comment\r\nmodel: ' + client + '\r\n---\r\nBody'
  put(root, `${claude}/child.md`, original('claude'))
  put(root, `${copilot}/child.agent.md`, original('copilot'))
  sync(root)
  put(root, `${copilot}/child.agent.md`, original('copilot').replace(description, 'description: Changed\r\n'))
  sync(root)
  assert.equal(get(root, `${claude}/child.md`), original('claude').replace(description, 'description: Changed\r\n'))
})

test('baseline order and formatting do not cause writes', (t) => {
  const root = fixture(t)
  sync(root)
  const state = JSON.parse(get(root, '.agent-sync.json'))
  state.pairs = Object.fromEntries(Object.entries(state.pairs).reverse())
  put(root, '.agent-sync.json', JSON.stringify(state))
  const before = snapshot(root)
  assert.equal(sync(root, 'check').ok, true)
  assert.deepEqual(sync(root).written, [])
  assert.deepEqual(snapshot(root), before)
})

test('retired third tree is rejected and never silently adopted or deleted', (t) => {
  const root = fixture(t)
  sync(root)
  put(root, 'com.anthropic.claude-code/agent-sources/unknown.md', 'Unrecognized work')
  const before = snapshot(root)
  assert.throws(() => sync(root), /third agent tree/)
  assert.deepEqual(snapshot(root), before)
})