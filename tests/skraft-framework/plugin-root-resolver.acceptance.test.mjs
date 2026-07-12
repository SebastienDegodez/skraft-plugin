import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import {
  discoverCacheRoots,
  resolvePluginRootFromEnv,
} from '../../plugins/src/adapters/infrastructure/plugin-root-resolver.mjs'

const HOME = '/home/alice'
const cacheHook = (version) =>
  `${HOME}/.claude/plugins/cache/hash/skraft/${version}/src/cli/hook.mjs`

// ─── discoverCacheRoots ─────────────────────────────────────────────────────

test('discoverCacheRoots: derives plugin roots from matched hook.mjs paths', () => {
  const glob = () => [cacheHook('1.1.0')]
  assert.deepEqual(
    discoverCacheRoots({ homeDir: HOME, glob }),
    [`${HOME}/.claude/plugins/cache/hash/skraft/1.1.0`],
  )
})

test('discoverCacheRoots: sorts matches ascending (newest last)', () => {
  const glob = () => [cacheHook('2.0.0'), cacheHook('1.1.0'), cacheHook('1.2.0')]
  const roots = discoverCacheRoots({ homeDir: HOME, glob })
  assert.equal(roots[roots.length - 1], `${HOME}/.claude/plugins/cache/hash/skraft/2.0.0`)
})

test('discoverCacheRoots: fail-open — no matches returns empty list', () => {
  assert.deepEqual(discoverCacheRoots({ homeDir: HOME, glob: () => [] }), [])
})

test('discoverCacheRoots: fail-open — glob nullish returns empty list', () => {
  assert.deepEqual(discoverCacheRoots({ homeDir: HOME, glob: () => undefined }), [])
})

test('discoverCacheRoots: fail-open — glob that throws returns empty list', () => {
  const glob = () => { throw new Error('EACCES') }
  assert.deepEqual(discoverCacheRoots({ homeDir: HOME, glob }), [])
})

// ─── resolvePluginRootFromEnv ───────────────────────────────────────────────

test('resolvePluginRootFromEnv: CLAUDE_PLUGIN_ROOT wins over cache + module', () => {
  const root = resolvePluginRootFromEnv({
    env: { CLAUDE_PLUGIN_ROOT: '/injected/skraft' },
    moduleUrl: pathToFileURL('/local/plugins/src/cli/hook.mjs').href,
    homeDir: HOME,
    glob: () => [cacheHook('1.1.0')],
  })
  assert.equal(root, '/injected/skraft')
})

test('resolvePluginRootFromEnv: no env → newest cache match', () => {
  const root = resolvePluginRootFromEnv({
    env: {},
    moduleUrl: pathToFileURL('/local/plugins/src/cli/hook.mjs').href,
    homeDir: HOME,
    glob: () => [cacheHook('1.1.0'), cacheHook('1.2.0')],
  })
  assert.equal(root, `${HOME}/.claude/plugins/cache/hash/skraft/1.2.0`)
})

test('resolvePluginRootFromEnv: no env + no cache → module-relative plugin root', () => {
  const root = resolvePluginRootFromEnv({
    env: {},
    moduleUrl: pathToFileURL('/local/plugins/src/cli/hook.mjs').href,
    homeDir: HOME,
    glob: () => [],
  })
  assert.equal(root, '/local/plugins/')
})
