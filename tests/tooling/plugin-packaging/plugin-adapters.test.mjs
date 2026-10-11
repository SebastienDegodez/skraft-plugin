import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { defaultPluginRoot, parseArgs, projectPluginAdapters } from '../../../scripts/project-plugin-adapters.mjs'

const claude = 'com.anthropic.claude-code/agents'
const copilot = 'com.github.copilot/agents'
const paths = [`${claude}/demo.md`, `${copilot}/demo.agent.md`, '.agent-sync.json', 'hooks/hooks.json', 'com.github.copilot/hooks/hooks.json']
const put = (root, path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) }
const sync = (root, mode = 'apply') => projectPluginAdapters({ pluginRoot: root, mode })
const snapshot = (root) => Object.fromEntries(readdirSync(root, { recursive: true }).filter((p) => lstatSync(join(root, p)).isFile()).sort().map((p) => [p, readFileSync(join(root, p), 'utf8')]))
function fixture(t) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'pair-safety-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  put(root, paths[0], '---\nname: native\ndescription: Shared\nmodel: haiku\ntools: [Read]\n---\nBody\n')
  put(root, paths[1], '---\nname: copilot\ndescription: Shared\nmodel: other\ntools: [read]\n---\nBody\n')
  put(root, paths[3], '{}\n')
  sync(root)
  return root
}
for (const path of [...paths, claude, copilot, 'com.anthropic.claude-code', 'com.github.copilot']) test(`reject symlink ${path}`, (t) => {
  const root = fixture(t)
  const outside = mkdtempSync(join(realpathSync(tmpdir()), 'pair-outside-'))
  t.after(() => rmSync(outside, { recursive: true, force: true }))
  put(outside, 'sentinel', 'Untouched')
  rmSync(join(root, path), { recursive: true, force: true })
  symlinkSync(/\.(md|json)$/.test(path) ? join(outside, 'sentinel') : outside, join(root, path))
  assert.throws(() => sync(root), /Symlink/)
  assert.equal(readFileSync(join(outside, 'sentinel'), 'utf8'), 'Untouched')
})
for (const path of paths) test(`reject hard link ${path}`, (t) => {
  const root = fixture(t)
  linkSync(join(root, path), join(root, 'external'))
  const before = snapshot(root)
  assert.throws(() => sync(root), /Hard-linked/)
  assert.deepEqual(snapshot(root), before)
})
for (const extra of [`${claude}/unknown.txt`, `${copilot}/nested/unknown.md`, 'com.github.copilot/hooks/unknown.json']) test(`unknown work blocks sync ${extra}`, (t) => {
  const root = fixture(t)
  put(root, extra, 'Preserve')
  const before = snapshot(root)
  assert.equal(sync(root, 'check').ok, false)
  assert.throws(() => sync(root), /Unexpected/)
  assert.deepEqual(snapshot(root), before)
})
test('old baseline cannot be silently reset', (t) => {
  const root = fixture(t)
  put(root, '.agent-sync.json', JSON.stringify({ version: 1, pairs: {} }))
  const before = snapshot(root)
  assert.throws(() => sync(root), /Legacy baseline/)
  assert.deepEqual(snapshot(root), before)
})
test('manifest must register native counterparts exactly once', (t) => {
  const root = fixture(t)
  put(root, '.claude-plugin/plugin.json', JSON.stringify({ agents: [] }))
  const before = snapshot(root)
  assert.throws(() => sync(root), /registration/)
  assert.deepEqual(snapshot(root), before)
})
test('CLI accepts only flat runtime layout and defaults to read-only check', () => {
  assert.deepEqual(parseArgs([]), { mode: 'check', pluginRoot: defaultPluginRoot, layout: 'flat' })
  for (const args of [['--layout', 'nested'], ['--check', '--apply'], ['--unknown'], ['--plugin-root']]) assert.throws(() => parseArgs(args))
})