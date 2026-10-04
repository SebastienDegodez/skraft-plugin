import { Ok, Err } from './result.mjs'
import { artifactPatternToRegExp } from './artifact-policy.mjs'
import { parseOutputEntry } from './phase-gate-policy.mjs'
import { phaseRoleOf } from './pipeline-policy.mjs'
import { canonicalAgentName } from './instruction-policy.mjs'

// Pure handoff policy. No IO. Derives, from the recorded pipeline state and the
// published config, what a phase agent must receive at dispatch — so no agent
// re-derives what an earlier agent already synthesised, and a retry never loses an
// input. Two consumers:
//   - buildHandoff  → `state.mjs handoff`, the manifest the orchestrator pastes verbatim;
//   - evaluateHandoff → the PreToolUse handoff guard, which refuses a phase-agent
//     dispatch whose prompt omits a recorded required input.
//
// An input entry is one of:
//   tracked    — a pattern under the tracking directory: resolved from recorded artefacts;
//   repository — a path pattern outside it (docs/adr/…, tests/**): passed as declared;
//   note       — free text (e.g. "Source code commits…"): passed as declared.
// Only a tracked input with a recorded match is enforceable: nothing else is on record.

const TRACKING_PREFIX = /^\.copilot-tracking\/skraft-plans\/\{projectSlug\}\//

export const HANDOFF_MODES = Object.freeze({
  FIRST_PASS: 'first-pass',
  REWORK: 'rework',
  RE_REVIEW: 're-review',
})

const classifyInput = (entry) => {
  const parsed = parseOutputEntry(entry)
  if (!parsed) return { kind: 'note', input: entry }
  if (TRACKING_PREFIX.test(parsed.pattern)) {
    return { kind: 'tracked', input: entry, pattern: parsed.pattern.replace(TRACKING_PREFIX, '') }
  }
  return { kind: 'repository', input: entry, pattern: parsed.pattern }
}

const unique = (values) => [...new Set(values)]

// State may hold a path recorded with Windows separators; compare and print one form.
const forwardSlashes = (path) => String(path).replace(/\\/g, '/')
const recordedIn = (state, phase) => (state?.phaseArtifacts?.[phase] ?? []).map(forwardSlashes)

// Every artefact recorded so far, phase order first, oldest first.
const recordedArtifacts = (state, config) => {
  const byPhase = state?.phaseArtifacts ?? {}
  const phases = unique([...(config?.phaseOrder ?? []), ...Object.keys(byPhase)])
  return unique(phases.flatMap((phase) => recordedIn(state, phase)))
}

const resolveInput = (entry, recorded) => {
  const input = classifyInput(entry)
  if (input.kind !== 'tracked') return { ...input, paths: [], resolved: false }
  const re = artifactPatternToRegExp(input.pattern)
  const paths = recorded.filter((path) => re.test(path))
  return { ...input, paths, resolved: paths.length > 0 }
}

const modeOf = (role, state, phase) => {
  if (state?.verdicts?.[phase] !== 'CHANGES_REQUESTED') return HANDOFF_MODES.FIRST_PASS
  return role === 'reviewer' ? HANDOFF_MODES.RE_REVIEW : HANDOFF_MODES.REWORK
}

// The handoff a phase agent receives in the phase currently open.
//   Err UNGOVERNED   — the agent belongs to no phase (lens, worker, product agent);
//   Err WRONG_PHASE  — the agent's phase is not the open one (G1 refuses it anyway).
export const buildHandoff = ({ agent, state, config }) => {
  const canonical = canonicalAgentName(agent, config)
  const target = canonical ? phaseRoleOf(canonical, config ?? {}) : null
  if (!target) {
    return Err({ code: 'UNGOVERNED', reason: `${agent} is not a pipeline phase agent; its dispatcher supplies its inputs` })
  }
  const phase = target.phase
  if (state?.currentPhase !== phase) {
    return Err({ code: 'WRONG_PHASE', reason: `${canonical} runs in ${phase}, but ${state?.currentPhase ?? 'no phase'} is open` })
  }

  const recorded = recordedArtifacts(state, config)
  const artifacts = config?.agentArtifacts?.[canonical] ?? {}
  const contextEntries = config?.agentContext?.[canonical] ?? []
  const mode = modeOf(target.role, state, phase)
  const retries = state?.retryCount?.[phase] ?? 0
  const maxRetries = state?.userPreferences?.maxRetriesPerPhase ?? 2
  const reviews = (state?.reviewArtifacts?.[phase] ?? []).map(forwardSlashes)
  const previousReview = mode === HANDOFF_MODES.FIRST_PASS ? null : (reviews.at(-1) ?? null)

  return Ok(Object.freeze({
    agent: canonical,
    phase,
    role: target.role,
    mode,
    attempt: retries + 1,
    maxAttempts: maxRetries + 1,
    required: (artifacts.inputs ?? []).map((entry) => resolveInput(entry, recorded)),
    context: contextEntries.map((entry) => resolveInput(entry, recorded)),
    underReview: target.role === 'reviewer' ? recordedIn(state, phase) : [],
    previousReview,
    previousOutputs: mode === HANDOFF_MODES.REWORK ? recordedIn(state, phase) : [],
  }))
}

const normalisePrompt = (prompt) => (typeof prompt === 'string' ? forwardSlashes(prompt) : '')

// The guard (G9). A dispatch must name at least one recorded path for every required
// tracked input, and — on a rework or re-review — the review that holds the findings.
// A specialist dispatched after its phase was APPROVED (DESIGN ADR ratification)
// carries the human verdicts, not the phase inputs, and is not judged.
export const evaluateHandoff = ({ agent, state, config, prompt }) => {
  const handoff = buildHandoff({ agent, state, config })
  if (!handoff.ok) return Ok({ reason: handoff.error.reason, missing: [] })
  if (handoff.value.role === 'specialist' && state?.verdicts?.[handoff.value.phase] === 'APPROVED') {
    return Ok({ reason: `${handoff.value.agent} runs after ${handoff.value.phase} was approved (ratification)`, missing: [] })
  }
  const text = normalisePrompt(prompt)
  const names = (path) => text.includes(path)

  const missing = handoff.value.required.flatMap((input) =>
    input.resolved
      ? input.paths.filter((path) => !names(path)).map((path) => ({ input: input.input, expected: [path] }))
      : [])
  if (handoff.value.previousReview && !names(handoff.value.previousReview)) {
    missing.push({ input: 'previous review with the findings', expected: [handoff.value.previousReview] })
  }

  if (missing.length === 0) {
    return Ok({ reason: `${handoff.value.agent} receives every recorded required input`, missing })
  }
  const list = missing.map(({ input, expected }) => `${input} → ${expected.join(' | ')}`).join('; ')
  return Err({
    code: 'HANDOFF_INCOMPLETE',
    missing,
    reason: `dispatch of ${handoff.value.agent} omits recorded inputs: ${list}; paste the block \`state.mjs handoff --agent "${handoff.value.agent}"\` prints`,
  })
}

const bullet = (prefix) => (input) => {
  if (input.kind === 'tracked') {
    return input.resolved
      ? input.paths.map((path) => `  - \`${prefix}${path}\``).join('\n')
      : `  - \`${input.input}\` — not recorded: supply the exact path, or state that it does not exist`
  }
  if (input.kind === 'repository') {
    return /[{*]/.test(input.pattern)
      ? `  - \`${input.pattern}\` — supply the exact path(s) the upstream agent returned`
      : `  - \`${input.pattern}\``
  }
  return `  - ${input.input} — supply it`
}

const MODE_LINES = {
  [HANDOFF_MODES.FIRST_PASS]: () => 'first pass',
  [HANDOFF_MODES.REWORK]: (h) => `rework — attempt ${h.attempt} of ${h.maxAttempts}. Apply rework mode: change only what the previous review's findings name; keep every other artefact, decision and passing gate as it is`,
  [HANDOFF_MODES.RE_REVIEW]: (h) => `re-review — attempt ${h.attempt} of ${h.maxAttempts}. Apply incremental re-review: re-run the lenses that had findings and the lenses whose inputs changed; carry forward the previous review's pass verdicts for the others`,
}

// The Markdown block the orchestrator pastes verbatim into the dispatch prompt.
// trackingPrefix — the repository-relative tracking directory, e.g.
// `.copilot-tracking/skraft-plans/checkout/`.
export const renderHandoff = (handoff, { trackingPrefix = '' } = {}) => {
  const toBullet = bullet(trackingPrefix)
  const lines = [
    '### Handoff (from `state.mjs handoff` — pasted verbatim)',
    `- Agent: ${handoff.agent} (${handoff.phase} ${handoff.role})`,
    `- Mode: ${MODE_LINES[handoff.mode](handoff)}`,
    '- Required inputs — read them; do not re-derive what they already settle:',
    ...(handoff.required.length > 0 ? handoff.required.map(toBullet) : ['  - none declared']),
  ]
  if (handoff.context.length > 0) {
    lines.push('- Context inputs — consult when a step needs them:', ...handoff.context.map(toBullet))
  }
  if (handoff.underReview.length > 0) {
    lines.push('- Artefacts under review:', ...handoff.underReview.map((path) => `  - \`${trackingPrefix}${path}\``))
  }
  if (handoff.previousReview) {
    lines.push(`- Previous review (its findings drive this pass): \`${trackingPrefix}${handoff.previousReview}\``)
  }
  if (handoff.previousOutputs.length > 0) {
    lines.push('- Your previous output (edit it in place):', ...handoff.previousOutputs.map((path) => `  - \`${trackingPrefix}${path}\``))
  }
  return lines.join('\n')
}
