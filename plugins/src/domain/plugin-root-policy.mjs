// Pure plugin-root resolution policy (US16 — consumer hook deployment). No IO.
// The consumer's hooks.json calls `node "${CLAUDE_PLUGIN_ROOT}/src/cli/hook.mjs"`.
// The Claude Code harness injects CLAUDE_PLUGIN_ROOT = the installed plugin path.
// When that env var is absent, the runtime resolves its own root deterministically:
//   1. CLAUDE_PLUGIN_ROOT (harness-injected) — authoritative.
//   2. Cache glob match — `~/.claude/plugins/cache/*/skraft/*` discovered on disk.
//   3. Module-relative root — where the running hook.mjs actually lives.
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

// Deterministic root selection. Never throws; always returns a usable root.
//   envRoot     — value of CLAUDE_PLUGIN_ROOT (string | undefined).
//   cacheRoots  — plugin roots discovered via the cache glob (already derived,
//                 sorted ascending by the caller; the last = newest install).
//   moduleRoot  — final fallback: where the running module resolves to.
export const resolvePluginRoot = ({ envRoot, cacheRoots = [], moduleRoot } = {}) => {
  if (isNonEmptyString(envRoot)) return envRoot.trim()
  const valid = (Array.isArray(cacheRoots) ? cacheRoots : []).filter(isNonEmptyString)
  if (valid.length > 0) return valid[valid.length - 1]
  return moduleRoot
}
