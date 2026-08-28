// Wire adapter: hook JSON the harnesses actually send -> the payload the services read.
//
// Mirror of harness-output.mjs, for the inbound direction. The two harnesses do NOT
// speak the same wire vocabulary:
//   - Claude Code sends `tool_name` ("Bash", "Write", "Edit") and `tool_input` as an
//     OBJECT.
//   - Copilot CLI sends `toolName` LOWERCASED ("bash", "write", "edit") and `toolArgs`
//     as a JSON-encoded STRING, plus the session `cwd`.
//
// The services speak the framework's vocabulary (`toolName: 'Bash'`, `toolInput` object).
// Without this translation a Copilot payload reaches G7 with toolName "bash", the
// `toolName === 'Bash'` test fails, the command is never extracted, and a protected-artifact
// write is silently allowed — the guard runs but sees nothing.

// Harness tool name (any casing) -> framework tool name. Unknown names pass through
// untouched: a guard that does not recognise a tool must not rename it.
const TOOL_NAMES = new Map([
  ['bash', 'Bash'],
  ['shell', 'Bash'],
  ['write', 'Write'],
  ['create_file', 'Write'],
  ['edit', 'Edit'],
  ['str_replace', 'Edit'],
  ['agent', 'Agent'],
  ['task', 'Agent'],
  ['read', 'Read'],
  ['view', 'Read']
])

const canonicalToolName = (name) =>
  typeof name === 'string' ? (TOOL_NAMES.get(name.toLowerCase()) ?? name) : undefined

// Copilot encodes the tool arguments as a JSON string; Claude Code sends the object.
// A malformed string must not throw here — a hook bug must never freeze the pipeline.
const asToolInput = (value) => {
  if (value && typeof value === 'object') return value
  if (typeof value !== 'string') return undefined
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : undefined
  } catch {
    return undefined
  }
}

// Normalises a raw harness payload into the framework payload the services expect.
// Fields already in framework vocabulary win, so an in-process caller is untouched.
const harnessOf = (raw, env) => {
  const explicit = raw.harness ?? raw.skraftHarness ?? env?.SKRAFT_HARNESS
  if (explicit) return explicit
  if (raw.agent_type != null || raw.agentType != null) return 'claude-code'
  if (env?.PLUGIN_ROOT && !env?.CLAUDE_PLUGIN_ROOT) return 'copilot'
  if (env?.CLAUDE_PLUGIN_ROOT && !env?.PLUGIN_ROOT) return 'claude-code'
  return undefined
}

export const fromHarnessInput = (raw = {}, { env = process.env } = {}) => {
  const toolName = canonicalToolName(raw.toolName ?? raw.tool_name)
  const toolInput = asToolInput(raw.toolInput ?? raw.tool_input ?? raw.toolArgs ?? raw.tool_args)
  const agentName = raw.agentName ?? raw.agent_name ?? raw.agentType ?? raw.agent_type
  const harness = harnessOf(raw, env)

  return {
    ...raw,
    ...(toolName === undefined ? {} : { toolName }),
    ...(toolInput === undefined ? {} : { toolInput }),
    ...(agentName === undefined ? {} : { agentName }),
    ...(harness === undefined ? {} : { harness }),
  }
}
