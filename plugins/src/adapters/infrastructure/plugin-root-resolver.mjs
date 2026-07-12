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

// Extract the semver string from a hook path (.../skraft/<version>/...).
const versionFromHookPath = (hookPath) => {
  const m = hookPath.match(/\/skraft\/([^/]+)\//)
  return m ? m[1] : ''
}

// Compare two semver strings numerically (returns negative / 0 / positive).
const semverCompare = (a, b) => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
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
// import.meta.url (…/plugins/src/cli/hook.mjs); `../..` climbs to plugin root
// (…/plugins).
export const resolvePluginRootFromEnv = ({
  env = process.env,
  moduleUrl,
  homeDir = homedir(),
  glob = globSync,
} = {}) => {
  const moduleRoot = moduleUrl ? fileURLToPath(new URL('../..', moduleUrl)) : undefined
  return resolvePluginRoot({
    envRoot: env?.CLAUDE_PLUGIN_ROOT,
    cacheRoots: discoverCacheRoots({ homeDir, glob }),
    moduleRoot,
  })
}
