// Pure plugin-root resolution policy (US16 — consumer hook deployment). No IO.
// The consumer's hooks.json calls `node "${CLAUDE_PLUGIN_ROOT}/src/cli/hook.mjs"`.
// The Claude Code harness injects CLAUDE_PLUGIN_ROOT = the installed plugin path.
// When that env var is absent, the runtime resolves its own root deterministically:
//   1. CLAUDE_PLUGIN_ROOT, then PLUGIN_ROOT (harness-injected) — authoritative.
//   2. Module-relative root — where the running code actually lives.
//   3. Cache glob match — `~/.claude/plugins/cache/*/skraft/*`, only when the caller
//      cannot name its own module (a stale install must never shadow the running code).
// The IO (home dir, glob) is supplied by the caller so this stays pure & testable.

// Glob suffix, relative to the user home dir, that locates an installed skraft
// runtime entrypoint. Forward slashes work with node:fs globSync on every OS.
export const CLAUDE_PLUGIN_CACHE_GLOB = '.claude/plugins/cache/*/skraft/*/src/cli/hook.mjs'

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== ''

// Build the absolute cache glob pattern for a given home directory. Trailing
// slashes/backslashes are trimmed so the join never produces a double separator.
export const pluginCacheGlobPattern = (homeDir) => {
  const base = isNonEmptyString(homeDir) ? homeDir.replace(/[/\\]+$/, '') : ''
  return `${base}/${CLAUDE_PLUGIN_CACHE_GLOB}`
}

// Deterministic root selection. Never throws; returns env/cache/moduleRoot (can be undefined).
//   envRoot     — value of CLAUDE_PLUGIN_ROOT (string | undefined).
//   cacheRoots  — plugin roots discovered via the cache glob (already derived,
//                 sorted ascending by the caller; the last = newest install).
//   moduleRoot  — final fallback: where the running module resolves to.
export const resolvePluginRoot = ({ envRoot, cacheRoots = [], moduleRoot } = {}) => {
  if (isNonEmptyString(envRoot)) return envRoot.trim()
  if (isNonEmptyString(moduleRoot)) return moduleRoot
  const valid = (Array.isArray(cacheRoots) ? cacheRoots : []).filter(isNonEmptyString)
  if (valid.length > 0) return valid[valid.length - 1]
  return moduleRoot
}

// Version segment of an installed hook path (.../<version>/src/cli/hook.mjs), either
// separator. Anchored on the entrypoint: the marketplace directory is often named
// `skraft` too (cache/skraft/skraft/<version>).
export const versionFromHookPath = (hookPath) => {
  const m = String(hookPath).match(/[\\/]([^\\/]+)[\\/]src[\\/]cli[\\/]hook\.mjs$/)
  return m ? m[1] : ''
}

const NUMERIC = /^\d+$/

const compareIdentifiers = (a, b) => {
  const aNumeric = NUMERIC.test(a)
  const bNumeric = NUMERIC.test(b)
  if (aNumeric && bNumeric) return Number(a) - Number(b)
  if (aNumeric !== bNumeric) return aNumeric ? -1 : 1
  return a.localeCompare(b)
}

// A shorter prerelease ranks below a longer one sharing its prefix (alpha < alpha.1).
const comparePrerelease = (left, right) => {
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if (left[i] === undefined) return -1
    if (right[i] === undefined) return 1
    const d = compareIdentifiers(left[i], right[i])
    if (d !== 0) return d
  }
  return 0
}

// Semver precedence (negative / 0 / positive): a prerelease ranks below its own
// release, and prerelease identifiers compare numerically when both are numeric.
// 1.5.2 < 1.6.0-hooks.2 < 1.6.0-hooks.10 < 1.6.0
export const compareSemver = (a, b) => {
  const [coreA, preA] = a.split(/-(.+)/s)
  const [coreB, preB] = b.split(/-(.+)/s)
  const partsA = coreA.split('.').map(Number)
  const partsB = coreB.split('.').map(Number)
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const d = (partsA[i] || 0) - (partsB[i] || 0)
    if (d !== 0) return d
  }
  if (preA === undefined && preB === undefined) return 0
  if (preA === undefined) return 1
  if (preB === undefined) return -1
  return comparePrerelease(preA.split('.'), preB.split('.'))
}
