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
  ['create', 'Write'],
  ['create_file', 'Write'],
  ['edit', 'Edit'],
  ['str_replace', 'Edit'],
  ['multiedit', 'MultiEdit'],
  ['notebookedit', 'NotebookEdit'],
  ['agent', 'Agent'],
  ['task', 'Agent'],
  ['read', 'Read'],
  ['view', 'Read'],
  ['read_file', 'Read']
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
  if (raw.toolArgs != null || raw.tool_args != null || raw.agentName != null || Array.isArray(raw.toolCalls)) return 'copilot'
  if (env?.PLUGIN_ROOT && !env?.CLAUDE_PLUGIN_ROOT) return 'copilot'
  // Installed Copilot plugin hooks also expose CLAUDE_PLUGIN_ROOT. Wire shape,
  // not that shared variable, is the authoritative harness discriminator.
  if (env?.CLAUDE_PLUGIN_ROOT && !env?.PLUGIN_ROOT) return 'claude-code'
  return undefined
}

// The tool-call signals of one call: the payload root, or one entry of a batch (whose
// entries name the tool `name` and its arguments `args`).
const toolCallOf = (raw, { name, args } = {}) => {
  const toolName = canonicalToolName(raw.toolName ?? raw.tool_name ?? name)
  const toolInput = asToolInput(raw.toolInput ?? raw.tool_input ?? raw.toolArgs ?? raw.tool_args ?? args)
  const requestedAgent = raw.requestedAgent ?? raw.requested_agent
    ?? toolInput?.subagentType ?? toolInput?.subagent_type
  const filePath = raw.filePath ?? raw.file_path
    ?? toolInput?.filePath ?? toolInput?.file_path ?? toolInput?.path ?? toolInput?.notebook_path
  return {
    ...(toolName === undefined ? {} : { toolName }),
    ...(toolInput === undefined ? {} : { toolInput }),
    ...(requestedAgent === undefined ? {} : { requestedAgent }),
    ...(filePath === undefined ? {} : { filePath }),
  }
}

// Copilot batches a turn's tool calls into `toolCalls: [{ id, name, args }]` instead of
// one `toolName` / `toolArgs`. Each entry becomes a framework tool call the guards read.
const toolCallsOf = (value) => {
  if (!Array.isArray(value)) return undefined
  return value
    .filter((call) => call && typeof call === 'object')
    .map((call) => ({
      ...(call.id === undefined ? {} : { toolCallId: call.id }),
      ...toolCallOf(call, { name: call.name, args: call.args ?? call.arguments }),
    }))
}

export const fromHarnessInput = (raw = {}, { env = process.env } = {}) => {
  const agentName = raw.agentName ?? raw.agent_name ?? raw.agentType ?? raw.agent_type
  const toolCalls = toolCallsOf(raw.toolCalls ?? raw.tool_calls)
  const harness = harnessOf(raw, env)

  return {
    ...raw,
    ...toolCallOf(raw),
    ...(agentName === undefined ? {} : { agentName }),
    ...(toolCalls === undefined ? {} : { toolCalls }),
    ...(harness === undefined ? {} : { harness }),
  }
}
