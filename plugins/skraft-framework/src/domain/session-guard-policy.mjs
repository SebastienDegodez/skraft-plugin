import { Ok, Err } from './result.mjs'
import { STATE_WRITE_FORBIDDEN, UNMONITORED_WRITE } from './error-codes.mjs'

// Pure domain: session-guard policy (G7/G8). No IO.
//
// G7 — the recorded pipeline state (state.json) and the DELIVER execution-log are
// mutable ONLY through the state CLI (S7 deterministic tool bridge). Any attempt to
// edit them directly — a shell redirection/mutation command, or a Write/Edit file
// tool targeting them — is denied. Reads stay allowed (the CLI is the sanctioned
// write path; #57 deny + #60 CLI = A9 strong form).
//
// G8 — during DELIVER, edits to the workspace (src/ and tests/) must happen inside
// the monitored DELIVER sub-agent. A write attempted outside that agent (e.g. the
// orchestrator session itself) is blocked so the phase boundary stays inviolable.

// Artifacts that may only change through the state CLI.
const PROTECTED_ARTIFACT_RE = /(?:^|[/\\])(?:state\.json|execution-log\.jsonl|execution-log\.json)(?=$|["'\s|;&)])/i

// A shell redirection (`>`, `>>`) or `tee` whose target token is a protected artifact.
const REDIRECT_TO_PROTECTED_RE = /(?:>>?|\btee\b(?:\s+-\S+)*)\s*["']?[^\s|;&<>"']*(?:state\.json|execution-log\.jsonl?)\b/i

// A mutating command (rm/mv/cp/sed -i/truncate/editors…) applied to a protected artifact.
const MUTATING_PROTECTED_RE = /\b(?:sed\s+-\S*i\S*|rm|mv|cp|tee|truncate|dd|install|vi|vim|nano|emacs|ex)\b[^\n]*?(?:state\.json|execution-log\.jsonl?)\b/i

// A path under src/ or tests/ (the monitored workspace).
const WORKSPACE_PATH_RE = /(?:^|[/\\])(?:src|tests)[/\\]/i

// A shell redirection whose target token lives under src/ or tests/.
const REDIRECT_TO_WORKSPACE_RE = /(?:>>?|\btee\b(?:\s+-\S+)*)\s*["']?(?:[^\s|;&<>"']*[/\\])?(?:src|tests)[/\\][^\s|;&<>"']+/i

// A mutating command applied to a path under src/ or tests/.
const MUTATING_WORKSPACE_RE = /\b(?:rm|mv|cp|truncate|dd|install|vi|vim|nano|emacs|ex)\b[^\n]*?(?:^|[\s"'=([{/\\])(?:src|tests)[/\\]/i

const isString = (value) => typeof value === 'string' && value.length > 0

// True when a Write/Edit file path targets a protected artifact.
export const isProtectedArtifactPath = (filePath) =>
  isString(filePath) && PROTECTED_ARTIFACT_RE.test(filePath)

// True when a shell command mutates a protected artifact (redirection or mutating verb).
export const commandMutatesProtectedArtifact = (command) =>
  isString(command) && (REDIRECT_TO_PROTECTED_RE.test(command) || MUTATING_PROTECTED_RE.test(command))

// True when a Write/Edit file path targets the src/ or tests/ workspace.
export const isWorkspacePath = (filePath) =>
  isString(filePath) && WORKSPACE_PATH_RE.test(filePath)

// True when a shell command writes into the src/ or tests/ workspace.
export const commandWritesWorkspace = (command) =>
  isString(command) && (REDIRECT_TO_WORKSPACE_RE.test(command) || MUTATING_WORKSPACE_RE.test(command))

// G7 — deny direct writes to state.json / execution-log; reads pass through.
export const guardProtectedArtifact = ({ command, filePath } = {}) => {
  if (isProtectedArtifactPath(filePath)) {
    return Err({
      code: STATE_WRITE_FORBIDDEN,
      reason: `direct edit of ${filePath} is forbidden; mutate recorded state only through the state CLI`
    })
  }
  if (commandMutatesProtectedArtifact(command)) {
    return Err({
      code: STATE_WRITE_FORBIDDEN,
      reason: 'direct edit of state.json/execution-log is forbidden; mutate recorded state only through the state CLI'
    })
  }
  return Ok({ reason: 'no direct write to a protected artifact' })
}

// G8 — during DELIVER, block src/ or tests/ writes performed outside a monitored
// DELIVER sub-agent (deliverAgents). Any other phase, or a write by a monitored
// agent, passes through.
export const guardWorkspaceWrite = ({ command, filePath, phase, agentName, deliverAgents = [] } = {}) => {
  if (phase !== 'DELIVER') {
    return Ok({ reason: `session guard inactive outside DELIVER (phase ${phase})` })
  }
  const writesWorkspace = isWorkspacePath(filePath) || commandWritesWorkspace(command)
  if (!writesWorkspace) {
    return Ok({ reason: 'no src/ or tests/ write' })
  }
  if (deliverAgents.includes(agentName)) {
    return Ok({ reason: `workspace write by monitored DELIVER agent ${agentName}` })
  }
  return Err({
    code: UNMONITORED_WRITE,
    reason: `src/ or tests/ write during DELIVER must run inside the monitored DELIVER sub-agent, not ${agentName ?? 'the orchestrator session'}`
  })
}

// Combined evaluation: G7 takes precedence over G8. Returns Ok when neither guard trips.
export const evaluateSessionGuard = ({ command, filePath, phase, agentName, deliverAgents } = {}) => {
  const protectedResult = guardProtectedArtifact({ command, filePath })
  if (protectedResult.ok === false) return protectedResult
  return guardWorkspaceWrite({ command, filePath, phase, agentName, deliverAgents })
}
