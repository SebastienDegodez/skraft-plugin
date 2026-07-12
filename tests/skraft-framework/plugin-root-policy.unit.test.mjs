import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CLAUDE_PLUGIN_CACHE_GLOB,
  pluginCacheGlobPattern,
  resolvePluginRoot,
} from '../../plugins/src/domain/plugin-root-policy.mjs'

// ─── pluginCacheGlobPattern ─────────────────────────────────────────────────

test('pluginCacheGlobPattern: joins home dir with the cache glob suffix', () => {
  assert.equal(
    pluginCacheGlobPattern('/home/alice'),
    `/home/alice/${CLAUDE_PLUGIN_CACHE_GLOB}`,
  )
})

test('pluginCacheGlobPattern: trims trailing slash and backslash', () => {
  assert.equal(pluginCacheGlobPattern('/home/alice/'), `/home/alice/${CLAUDE_PLUGIN_CACHE_GLOB}`)
  assert.equal(pluginCacheGlobPattern('C:\\Users\\bob\\'), `C:\\Users\\bob/${CLAUDE_PLUGIN_CACHE_GLOB}`)
})

test('pluginCacheGlobPattern: missing home dir yields a root-relative pattern', () => {
  assert.equal(pluginCacheGlobPattern(undefined), `/${CLAUDE_PLUGIN_CACHE_GLOB}`)
  assert.equal(pluginCacheGlobPattern(''), `/${CLAUDE_PLUGIN_CACHE_GLOB}`)
})

// ─── resolvePluginRoot ──────────────────────────────────────────────────────

test('resolvePluginRoot: prefers CLAUDE_PLUGIN_ROOT when present', () => {
  const root = resolvePluginRoot({
    envRoot: '/cache/abc/skraft/1.1.0',
    cacheRoots: ['/cache/other/skraft/9.9.9'],
    moduleRoot: '/local/plugins',
  })
  assert.equal(root, '/cache/abc/skraft/1.1.0')
})

test('resolvePluginRoot: trims whitespace around the env root', () => {
  assert.equal(resolvePluginRoot({ envRoot: '  /cache/x  ' }), '/cache/x')
})

test('resolvePluginRoot: blank env root falls through to the cache glob match', () => {
  const root = resolvePluginRoot({
    envRoot: '   ',
    cacheRoots: ['/cache/a/skraft/1.0.0', '/cache/b/skraft/1.2.0'],
    moduleRoot: '/local/plugins',
  })
  assert.equal(root, '/cache/b/skraft/1.2.0')
})

test('resolvePluginRoot: picks the last (newest) cache root', () => {
  const root = resolvePluginRoot({
    cacheRoots: ['/cache/skraft/1.0.0', '/cache/skraft/1.1.0', '/cache/skraft/2.0.0'],
    moduleRoot: '/local/plugins',
  })
  assert.equal(root, '/cache/skraft/2.0.0')
})

test('resolvePluginRoot: ignores blank entries in cacheRoots', () => {
  const root = resolvePluginRoot({
    cacheRoots: ['', '   ', '/cache/skraft/1.0.0'],
    moduleRoot: '/local/plugins',
  })
  assert.equal(root, '/cache/skraft/1.0.0')
})

test('resolvePluginRoot: no env and no cache match → module-relative fallback', () => {
  assert.equal(
    resolvePluginRoot({ cacheRoots: [], moduleRoot: '/local/plugins' }),
    '/local/plugins',
  )
})

test('resolvePluginRoot: defensive against non-array cacheRoots', () => {
  assert.equal(
    resolvePluginRoot({ cacheRoots: null, moduleRoot: '/local/plugins' }),
    '/local/plugins',
  )
})

test('resolvePluginRoot: no args returns undefined without throwing', () => {
  assert.equal(resolvePluginRoot(), undefined)
})
