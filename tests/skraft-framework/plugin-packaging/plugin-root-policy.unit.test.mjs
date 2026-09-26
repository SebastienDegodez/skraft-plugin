import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CLAUDE_PLUGIN_CACHE_GLOB,
  compareSemver,
  pluginCacheGlobPattern,
  resolvePluginRoot,
  versionFromHookPath,
} from '../../../plugins/skraft-framework/src/domain/plugin-root-policy.mjs'

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

test('resolvePluginRoot: blank env root falls through to the running module', () => {
  const root = resolvePluginRoot({
    envRoot: '   ',
    cacheRoots: ['/cache/a/skraft/1.0.0', '/cache/b/skraft/1.2.0'],
    moduleRoot: '/local/plugins',
  })
  assert.equal(root, '/local/plugins')
})

test('resolvePluginRoot: the running module wins over any installed copy', () => {
  const root = resolvePluginRoot({
    cacheRoots: ['/cache/skraft/1.0.0', '/cache/skraft/2.0.0'],
    moduleRoot: '/local/plugins',
  })
  assert.equal(root, '/local/plugins')
})

test('resolvePluginRoot: without a module root, picks the last (newest) non-blank cache root', () => {
  assert.equal(resolvePluginRoot({ cacheRoots: ['/cache/skraft/1.0.0', '/cache/skraft/1.1.0', '/cache/skraft/2.0.0'] }), '/cache/skraft/2.0.0')
  assert.equal(resolvePluginRoot({ cacheRoots: ['/cache/skraft/1.0.0', '', '   '], moduleRoot: '  ' }), '/cache/skraft/1.0.0')
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

// ─── installed-version ordering ─────────────────────────────────────────────

test('versionFromHookPath: reads the segment before src/cli/hook.mjs, whatever the marketplace name', () => {
  assert.equal(versionFromHookPath('/h/.claude/plugins/cache/skraft/skraft/1.6.0/src/cli/hook.mjs'), '1.6.0')
  assert.equal(versionFromHookPath('C:\\Users\\a\\.claude\\plugins\\cache\\skraft\\skraft\\1.6.0\\src\\cli\\hook.mjs'), '1.6.0')
  assert.equal(versionFromHookPath('/h/skraft/1.6.0/src/cli/hook.mjs.bak'), '')
  assert.equal(versionFromHookPath('/h/skraft/1.6.0/lib/cli/hook.mjs'), '')
})

const sign = (n) => Math.sign(n)

test('compareSemver: orders core versions numerically, missing segments count as zero', () => {
  assert.equal(sign(compareSemver('1.10.0', '1.9.0')), 1)
  assert.equal(sign(compareSemver('1.9.0', '1.10.0')), -1)
  assert.equal(sign(compareSemver('2.0.0', '1.99.99')), 1)
  assert.equal(compareSemver('1.0', '1.0.0'), 0)
  assert.equal(sign(compareSemver('1.0', '1.0.1')), -1)
  assert.equal(sign(compareSemver('1.0.1', '1.0')), 1)
})

test('compareSemver: a prerelease ranks below its own release and above the previous one', () => {
  assert.equal(sign(compareSemver('1.6.0-hooks.1', '1.6.0')), -1)
  assert.equal(sign(compareSemver('1.6.0', '1.6.0-hooks.1')), 1)
  assert.equal(sign(compareSemver('1.6.0-hooks.1', '1.5.2')), 1)
  assert.equal(compareSemver('1.6.0-hooks.1', '1.6.0-hooks.1'), 0)
})

test('compareSemver: prerelease identifiers compare numerically, then lexically, numeric first', () => {
  assert.equal(sign(compareSemver('1.0.0-hooks.10', '1.0.0-hooks.2')), 1)
  assert.equal(sign(compareSemver('1.0.0-hooks.2', '1.0.0-hooks.10')), -1)
  assert.equal(sign(compareSemver('1.0.0-beta', '1.0.0-alpha')), 1)
  assert.equal(sign(compareSemver('1.0.0-alpha', '1.0.0-beta')), -1)
  assert.equal(sign(compareSemver('1.0.0-1', '1.0.0-alpha')), -1)
  assert.equal(sign(compareSemver('1.0.0-alpha', '1.0.0-1')), 1)
  assert.equal(sign(compareSemver('1.0.0-alpha', '1.0.0-alpha.1')), -1)
  assert.equal(sign(compareSemver('1.0.0-alpha.1', '1.0.0-alpha')), 1)
  assert.equal(sign(compareSemver('1.0.0-rc-1', '1.0.0-rc')), 1)
})
