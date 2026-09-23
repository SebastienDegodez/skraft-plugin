import * as fs from 'node:fs'
import { homedir } from 'node:os'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  pluginCacheGlobPattern,
  resolvePluginRoot,
} from '../../domain/plugin-root-policy.mjs'

const globSync = fs.globSync
// Infrastructure adapter for US16 plugin-root resolution. Owns the IO the pure
// domain policy can't do: reading the home dir and globbing the Claude Code
// plugin cache. globSync (Node ≥ 22) accepts forward-slash patterns on Windows
// too, so a single pattern is cross-platform (Mac + Windows).

// Derive the plugin root (…/skraft/<version>) from a matched hook.mjs path:
// <root>/skraft/<version>/src/cli/hook.mjs → <root>/skraft/<version>.
const rootFromHookPath = (hookPath) => dirname(dirname(dirname(hookPath)))

// Extract the semver string from a hook path (.../<version>/src/cli/hook.mjs).
// Anchored on the entrypoint suffix: the marketplace directory is often named
// `skraft` too (cache/skraft/skraft/<version>).
const versionFromHookPath = (hookPath) => {
  const m = hookPath.replace(/\\/g, '/').match(/\/([^/]+)\/src\/cli\/hook\.mjs$/)
  return m ? m[1] : ''
}

const compareIdentifiers = (a, b) => {
  const na = /^\d+$/.test(a) ? Number(a) : null
  const nb = /^\d+$/.test(b) ? Number(b) : null
  if (na !== null && nb !== null) return na - nb
  if (na !== null) return -1
  if (nb !== null) return 1
  return a < b ? -1 : a > b ? 1 : 0
}

// Semver precedence (returns negative / 0 / positive). A prerelease ranks below
// its own release: 1.5.2 < 1.6.0-hooks.2 < 1.6.0-hooks.10 < 1.6.0.
const semverCompare = (a, b) => {
  const [coreA, preA] = a.split(/-(.*)/s)
  const [coreB, preB] = b.split(/-(.*)/s)
  const pa = coreA.split('.').map((n) => Number(n) || 0)
  const pb = coreB.split('.').map((n) => Number(n) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  if (!preA && !preB) return 0
  if (!preA) return 1
  if (!preB) return -1
  const ia = preA.split('.')
  const ib = preB.split('.')
  for (let i = 0; i < Math.max(ia.length, ib.length); i++) {
    if (ia[i] === undefined) return -1
    if (ib[i] === undefined) return 1
    const d = compareIdentifiers(ia[i], ib[i])
    if (d !== 0) return d
  }
  return 0
}

// Discover every installed skraft runtime via the cache glob. Fail-open: any
// error (glob unsupported, permission, missing dir) yields an empty list so the
// caller falls through to the module-relative root.
export const discoverCacheRoots = ({ homeDir = homedir(), glob = globSync } = {}) => {
  try {
    const matches = glob(pluginCacheGlobPattern(homeDir)) ?? []
    return [...matches].sort((a, b) => semverCompare(versionFromHookPath(a), versionFromHookPath(b))).map(rootFromHookPath)
  } catch {
    return []
  }
}

// Full runtime resolution used by cli/hook.mjs. `moduleUrl` is the caller's
// import.meta.url (…/plugins/skraft-framework/src/cli/hook.mjs); `../..` climbs to plugin root
// (…/plugins/skraft-framework).
export const resolvePluginRootFromEnv = ({
  env = process.env,
  moduleUrl,
  homeDir = homedir(),
  glob = globSync,
} = {}) => {
  const moduleRoot = moduleUrl ? fileURLToPath(new URL('../..', moduleUrl)) : undefined
  return resolvePluginRoot({
    envRoot: env?.CLAUDE_PLUGIN_ROOT || env?.PLUGIN_ROOT,
    cacheRoots: discoverCacheRoots({ homeDir, glob }),
    moduleRoot,
  })
}
