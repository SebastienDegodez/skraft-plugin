// Pure hook-relevance policy. No IO.
//
// Each tool event runs one hook entry with no matcher, because VS Code ignores matchers
// and would otherwise run every entry of the event on every tool call. This policy is
// the filter the matchers used to be: it tells the hook entry point, before it loads any
// guard, whether a tool call can reach a guard at all.
//
// It reads a payload already normalised by harness-input.mjs (framework tool names).

// A write through a tool to a tracked pipeline state: always routed to the guards, so
// the hook's own failure path can still refuse it.
export const TRACKED_STATE_WRITE_RE = /skraft-plans[/\\][^"'\s]*state\.json/

// The tools a PreToolUse guard inspects: dispatch guards (G1, G9, provenance) and the
// session guard (G7 Bash command or file write).
const PRE_TOOL_USE_TOOLS = new Set(['Agent', 'Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

const SKILL_FILE_RE = /SKILL\.md$/i

const isText = (value) => typeof value === 'string' && value.length > 0

const readsSkillFile = (payload) =>
  [payload.filePath, payload.toolInput?.path, payload.toolInput?.file_path]
    .some((path) => isText(path) && SKILL_FILE_RE.test(path))

// True when the hook must run its guards for this event; false when no guard can act on
// it and the entry point may return before importing anything.
const callRelevant = (event, call) => {
  if (isText(call.requestedAgent)) return true
  if (event === 'PreToolUse') return PRE_TOOL_USE_TOOLS.has(call.toolName)
  return call.toolName === 'Agent' || readsSkillFile(call)
}

// A batched payload (Copilot `toolCalls`) is relevant when any of its calls is.
export const isHookRelevant = ({ event, payload = {}, raw = '' } = {}) => {
  if (event !== 'PreToolUse' && event !== 'PostToolUse') return true
  if (typeof raw === 'string' && TRACKED_STATE_WRITE_RE.test(raw)) return true
  if (callRelevant(event, payload)) return true
  return Array.isArray(payload.toolCalls)
    && payload.toolCalls.some((call) => call && typeof call === 'object' && callRelevant(event, call))
}
