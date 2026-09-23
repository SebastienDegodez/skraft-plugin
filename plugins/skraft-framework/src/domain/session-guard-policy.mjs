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

// Artifacts that may only change through the state CLI, all under the tracking directory
// (default .copilot-tracking/skraft-plans): each project's state.json and execution log,
// and the active-pipeline pointer the hooks trust. Any other state.json is not ours.
const DEFAULT_TRACKING_DIR = 'skraft-plans'
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const protectedPathRe = (trackingDir) => new RegExp(
  `(?:^|[\\s/\\\\"'=(])(?:${[...new Set([DEFAULT_TRACKING_DIR, trackingDir].filter(Boolean))].map(escapeRegExp).join('|')})[/\\\\](?:[a-z0-9]+(?:-[a-z0-9]+)*[/\\\\](?:state\\.json|execution-log\\.jsonl?)|\\.active-slug)(?=$|["'\\s|;&)<>,])`,
  'i'
)

// Shell commands whose first word rewrites or removes the files it names. For the
// copy-like verbs only the destination (last operand) is written; the sources are read.
const REWRITING_VERBS = new Set(['rm', 'mv', 'tee', 'truncate', 'dd', 'shred', 'unlink', 'touch', 'vi', 'vim', 'nano', 'emacs', 'ex', 'ed'])
const COPYING_VERBS = new Set(['cp', 'install', 'ln', 'rsync'])
const INLINE_INTERPRETERS = /^(?:node|nodejs|deno|bun|python[0-9.]*|perl|ruby|php)$/
const INLINE_SCRIPT_FLAGS = new Set(['-e', '--eval', '-c', '-p', '--print', '-r'])
const COMMAND_PREFIXES = new Set(['sudo', 'command', 'env', 'exec', 'nohup', 'time', 'xargs'])

// Split a command line into simple commands at ; & && || | and newlines — never inside
// a redirection operator (>|, &>, >&, 2>&1).
const segmentsOf = (command) =>
  command.split(/\|\||&&|;|\n|(?<![>&])&(?![>&])|(?<!>)\|/).map((s) => s.trim()).filter(Boolean)

// Words of a simple command, quotes stripped, leading VAR=value assignments and
// wrapper commands (sudo, env…) removed so the first word is the verb. A word joins
// quoted and unquoted parts, as the shell does: VAR="a b" is one word.
const wordsOf = (segment) => {
  const words = (segment.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []).map((w) => w.replace(/^["']|["']$/g, ''))
  let start = 0
  while (start < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[start]) || COMMAND_PREFIXES.has(words[start]))) start++
  return words.slice(start)
}

// Redirection targets (`>`, `>>`, `>|`, `&>`) of a simple command; `<`/`<<` are reads.
const redirectTargetsOf = (segment) =>
  [...segment.matchAll(/(?:^|[^<>&0-9])[0-9&]?>>?\|?\s*("[^"]*"|'[^']*'|[^\s|;&<>]+)/g)].map((m) => m[1].replace(/^["']|["']$/g, ''))

// True when a simple command writes a path `isTarget` accepts: G7's tracked state, G8's
// workspace.
const segmentWrites = (segment, isTarget) => {
  if (redirectTargetsOf(segment).some(isTarget)) return true
  const [verb, ...operands] = wordsOf(segment)
  if (!verb) return false
  const name = verb.split(/[/\\]/).pop()
  if (!isTarget(segment)) return false
  if (REWRITING_VERBS.has(name)) return true
  const inPlace = operands.some((w) => /^-[A-Za-z]*i/.test(w) || w.startsWith('--in-place'))
  if (name === 'sed' || (name === 'perl' && inPlace)) return inPlace
  if (COPYING_VERBS.has(name)) {
    const paths = operands.filter((w) => !w.startsWith('-'))
    return paths.length > 1 && isTarget(paths[paths.length - 1])
  }
  // An inline script naming a target (node -e, python -c…) may write it: refuse, reads
  // have cat, grep and jq.
  if (INLINE_INTERPRETERS.test(name)) return operands.some((w) => INLINE_SCRIPT_FLAGS.has(w))
  return false
}

// A path under src/ or tests/ (the monitored workspace).
const WORKSPACE_PATH_RE = /(?:^|[/\\])(?:src|tests)[/\\]/i

// A shell redirection whose target token lives under src/ or tests/.
const REDIRECT_TO_WORKSPACE_RE = /(?:>>?|\btee\b(?:\s+-\S+)*)\s*["']?(?:[^\s|;&<>"']*[/\\])?(?:src|tests)[/\\][^\s|;&<>"']+/i

// A mutating command applied to a path under src/ or tests/.
const MUTATING_WORKSPACE_RE = /\b(?:rm|mv|cp|truncate|dd|install|vi|vim|nano|emacs|ex)\b[^\n]*?(?:^|[\s"'=([{/\\])(?:src|tests)[/\\]/i

const isString = (value) => typeof value === 'string' && value.length > 0

// True when a file path targets a protected artifact of the tracking directory.
export const isProtectedArtifactPath = (filePath, { trackingDir } = {}) =>
  isString(filePath) && protectedPathRe(trackingDir).test(filePath)

// True when a shell command rewrites, removes or overwrites a protected artifact.
// Reading one (cat, jq, grep, cp as a source, a redirect of its content elsewhere) is not.
export const commandMutatesProtectedArtifact = (command, { trackingDir } = {}) => {
  if (!isString(command)) return false
  const re = protectedPathRe(trackingDir)
  return segmentsOf(command).some((segment) => segmentWrites(segment, (text) => re.test(text)))
}

// True when a Write/Edit file path targets the src/ or tests/ workspace.
export const isWorkspacePath = (filePath) =>
  isString(filePath) && WORKSPACE_PATH_RE.test(filePath)

// A src/ or tests/ path segment inside a command line or a path.
const NAMES_WORKSPACE_RE = /(?:^|[\s"'=([{/\\])(?:src|tests)[/\\]/i

// True when a shell command writes into the src/ or tests/ workspace: the forms G7 reads
// (in-place sed, inline scripts…), plus a mutating verb anywhere on the line (git rm…).
export const commandWritesWorkspace = (command) =>
  isString(command) && (REDIRECT_TO_WORKSPACE_RE.test(command) || MUTATING_WORKSPACE_RE.test(command)
    || segmentsOf(command).some((segment) => segmentWrites(segment, (text) => NAMES_WORKSPACE_RE.test(text))))

// G7 — deny direct writes to state.json / execution-log; reads pass through.
export const guardProtectedArtifact = ({ command, filePath, trackingDir } = {}) => {
  if (isProtectedArtifactPath(filePath, { trackingDir })) {
    return Err({
      code: STATE_WRITE_FORBIDDEN,
      reason: `direct edit of ${filePath} is forbidden; mutate recorded state only through the state CLI`
    })
  }
  if (commandMutatesProtectedArtifact(command, { trackingDir })) {
    return Err({
      code: STATE_WRITE_FORBIDDEN,
      reason: 'direct edit of a tracked state.json, execution log or active pointer is forbidden; mutate recorded state only through the state CLI'
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
export const evaluateSessionGuard = ({ command, filePath, phase, agentName, deliverAgents, trackingDir } = {}) => {
  const protectedResult = guardProtectedArtifact({ command, filePath, trackingDir })
  if (protectedResult.ok === false) return protectedResult
  return guardWorkspaceWrite({ command, filePath, phase, agentName, deliverAgents })
}
