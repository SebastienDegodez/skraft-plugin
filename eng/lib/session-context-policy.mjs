// Pure policy: what SessionStart tells the session. No IO.

// POSIX single-quoted shell word: safe for any path, including quotes and spaces.
const shellQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`

// Lines appended to Claude Code's CLAUDE_ENV_FILE: every later Bash call and hook of the
// session sees the plugin's absolute location.
export const envFileLines = ({ pluginRoot }) => `export SKRAFT_PLUGIN_ROOT=${shellQuote(pluginRoot)}\n`

// The context injected at session start: where the SKRAFT plugin and its skill scripts
// live, and the active pipeline when there is one.
export const sessionContext = ({ pluginRoot, activeSlug, currentPhase }) => {
  const root = String(pluginRoot).replace(/[/\\]+$/, '')
  const lines = [
    `SKRAFT plugin root: ${root} ($SKRAFT_PLUGIN_ROOT in Bash when set).`,
    `Run a skill's scripts by absolute path, e.g. node "${root}/skills/<skill>/scripts/<script>.mjs".`,
  ]
  if (activeSlug) {
    lines.push(`Active pipeline: ${activeSlug}, phase ${currentPhase ?? 'unknown'}.`)
  }
  return lines.join('\n')
}
