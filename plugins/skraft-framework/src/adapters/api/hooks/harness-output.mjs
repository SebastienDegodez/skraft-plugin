// Wire adapter: framework decision -> hook JSON the harnesses actually validate.
//
// decision.mjs speaks the framework's own vocabulary (allow / deny / block /
// additionalContext). No harness knows it: Claude Code's hook-output schema types the
// root `decision` as enum("approve","block"), so `{"decision":"allow"}` fails validation
// at the root and the WHOLE output is discarded — guard included. That is why a denied
// tool still ran.
//
// One envelope serves both harnesses:
//   - Claude Code reads hookSpecificOutput.{hookEventName,permissionDecision,additionalContext}
//     and drops unknown root keys (its schema object is non-strict).
//   - Copilot CLI reads permissionDecision / permissionDecisionReason / additionalContext
//     at the ROOT and ignores hookSpecificOutput.
// Emitting both keeps the two manifests routing the exact same CLI command (hook-manifest-parity).

// PreToolUse is the only event that gates a tool; every other event refuses through the
// root `decision: "block"` both harnesses share.
const PRE_TOOL_USE = 'PreToolUse'

// A refusal on PreToolUse: the tool alone is denied, the session keeps going. Never
// `continue: false` — a hook bug must not freeze the pipeline (README fail-mode rule),
// so `block` and `deny` map onto the same wire refusal here.
const refuseTool = (reason, hookEventName) => ({
  permissionDecision: 'deny',
  permissionDecisionReason: reason,
  hookSpecificOutput: {
    hookEventName,
    permissionDecision: 'deny',
    permissionDecisionReason: reason
  }
})

const refuseEvent = (reason) => ({ decision: 'block', reason })

const injectContext = (context, hookEventName) => ({
  additionalContext: context,
  hookSpecificOutput: { hookEventName, additionalContext: context }
})

// Returns the wire object, or undefined when there is nothing to say. An allow writes
// NOTHING: empty stdout is never parsed, so it can never fail validation.
export const toHarnessOutput = (decision, hookEventName) => {
  if (!decision || !hookEventName) return undefined

  switch (decision.decision) {
    case 'deny':
    case 'block':
      return hookEventName === PRE_TOOL_USE
        ? refuseTool(decision.message, hookEventName)
        : refuseEvent(decision.message)
    case 'additionalContext':
      return decision.context ? injectContext(decision.context, hookEventName) : undefined
    default:
      return undefined
  }
}
