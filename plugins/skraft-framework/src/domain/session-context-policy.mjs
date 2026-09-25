// Pure policy: what SessionStart tells the session. No IO.

// POSIX single-quoted shell word: safe for any path, including quotes and spaces.
const shellQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`

// Lines appended to Claude Code's CLAUDE_ENV_FILE: every later Bash call and hook of the
// session sees the plugin's absolute location.
export const envFileLines = ({ pluginRoot }) => `export SKRAFT_PLUGIN_ROOT=${shellQuote(pluginRoot)}\n`

// The context both harnesses inject at session start: where the SKRAFT CLIs live, and
// the pipeline the guards act on when one is active.
export const sessionContext = ({ pluginRoot, activeSlug, currentPhase }) => {
  const root = String(pluginRoot).replace(/[/\\]+$/, '')
  const lines = [
    `SKRAFT plugin root: ${root} ($SKRAFT_PLUGIN_ROOT in Bash when set).`,
    `Run the SKRAFT CLIs by absolute path, e.g. node "${root}/src/cli/state.mjs" get.`,
  ]
  if (activeSlug) {
    lines.push(`Active pipeline: ${activeSlug}, phase ${currentPhase ?? 'unknown'} — the SKRAFT hooks guard this pipeline; state.mjs select switches it.`)
  }
  return lines.join('\n')
}
