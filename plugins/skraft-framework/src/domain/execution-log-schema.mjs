import { Ok, Err } from './result.mjs'

// SINGLE SOURCE OF TRUTH for the DELIVER execution-log document shape (S7 tool bridge).
// The execution log is the tamper-proof record of the TDD phases the DELIVER agent
// actually walked through, per behavior slice ("step"). It is distinct from state.json
// (pipeline phases) — this log lives at {slug}/execution-log.json and only the CLI
// (init-log / log-phase / verify-integrity) writes to it. Pure domain: no IO.

// Canonical TDD cycle, in order. A step walks these phases outside-in-tdd style:
// RED (failing test) → GREEN (make it pass) → REFACTOR (clean up) → COMMIT (terminal).
export const TDD_PHASES = Object.freeze(['RED', 'GREEN', 'REFACTOR', 'COMMIT'])

// Phases a complete step MUST contain. Every required phase has to be logged at least
// once for the step to count as complete (verify-integrity fails otherwise).
export const REQUIRED_PHASES = Object.freeze(['RED', 'GREEN', 'REFACTOR', 'COMMIT'])

// Phases that terminate a step. Once a terminal phase is logged the step is closed;
// COMMIT is the only terminal phase (a step ends when its work is committed).
export const TERMINAL_PHASES = Object.freeze(['COMMIT'])

const PHASE_SET = new Set(TDD_PHASES)

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0

// Real UTC ISO-8601 timestamp with millisecond precision and a Z suffix, exactly as
// produced by Date.prototype.toISOString(). Rejecting non-UTC / non-ISO strings keeps
// the log deterministic and comparable across machines.
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

const isIsoUtcTimestamp = (value) => {
  if (typeof value !== 'string' || !ISO_UTC.test(value)) return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
}

export const isValidPhase = (phase) => PHASE_SET.has(phase)

// Validates a single log entry. Returns a frozen, normalized entry on success.
export const validateEntry = (raw) => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return Err({ code: 'INVALID_ENTRY', fields: ['entry'], reason: 'log entry must be an object' })
  }

  const fields = []
  if (!isNonEmptyString(raw.step)) fields.push('step')
  if (!isValidPhase(raw.phase)) fields.push('phase')
  if (!isIsoUtcTimestamp(raw.timestamp)) fields.push('timestamp')
  if (raw.note !== undefined && typeof raw.note !== 'string') fields.push('note')

  if (fields.length > 0) {
    return Err({ code: 'INVALID_ENTRY', fields, reason: `log entry is invalid in field(s): ${fields.join(', ')}` })
  }

  const entry = { step: raw.step, phase: raw.phase, timestamp: raw.timestamp }
  if (raw.note !== undefined) entry.note = raw.note
  return Ok(Object.freeze(entry))
}

// Validates (and normalizes) the full execution-log document. Every entry must be valid.
export const validateLog = (raw) => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return Err({ code: 'INVALID_LOG', fields: ['log'], reason: 'execution log must be an object' })
  }
  if (!isNonEmptyString(raw.slug)) {
    return Err({ code: 'INVALID_LOG', fields: ['slug'], reason: 'execution log slug must be a non-empty string' })
  }
  if (!isIsoUtcTimestamp(raw.createdAt)) {
    return Err({ code: 'INVALID_LOG', fields: ['createdAt'], reason: 'execution log createdAt must be a real UTC ISO-8601 timestamp' })
  }
  if (!Array.isArray(raw.entries)) {
    return Err({ code: 'INVALID_LOG', fields: ['entries'], reason: 'execution log entries must be an array' })
  }

  const entries = []
  for (let i = 0; i < raw.entries.length; i++) {
    const result = validateEntry(raw.entries[i])
    if (!result.ok) {
      return Err({ code: 'INVALID_LOG', fields: [`entries[${i}]`], reason: `entry ${i}: ${result.error.reason}` })
    }
    entries.push(result.value)
  }

  return Ok(Object.freeze({
    slug: raw.slug,
    createdAt: raw.createdAt,
    entries: Object.freeze(entries),
  }))
}

// Pure append: validates the entry, then returns a new frozen log with it appended.
export const appendEntry = (log, entry) => {
  const logResult = validateLog(log)
  if (!logResult.ok) return logResult

  const entryResult = validateEntry(entry)
  if (!entryResult.ok) return entryResult

  const base = logResult.value
  return Ok(Object.freeze({
    ...base,
    entries: Object.freeze([...base.entries, entryResult.value]),
  }))
}

// Groups the logged phases by step. Returns Map<step, Set<phase>>.
const phasesByStep = (entries) => {
  const map = new Map()
  for (const entry of entries) {
    if (!map.has(entry.step)) map.set(entry.step, new Set())
    map.get(entry.step).add(entry.phase)
  }
  return map
}

// Completeness check (S7): every step must contain all REQUIRED_PHASES and reach a
// terminal phase. Returns Ok({ complete: true, steps: [...] }) when every step is
// complete, otherwise Err with the per-step missing-phase breakdown.
export const verifyIntegrity = (log) => {
  const logResult = validateLog(log)
  if (!logResult.ok) return logResult

  const { entries } = logResult.value
  const grouped = phasesByStep(entries)

  if (grouped.size === 0) {
    return Err({ code: 'INCOMPLETE_LOG', reason: 'execution log has no steps', incomplete: [] })
  }

  const incomplete = []
  const steps = []
  for (const [step, phases] of grouped) {
    const missing = REQUIRED_PHASES.filter((phase) => !phases.has(phase))
    const reachedTerminal = TERMINAL_PHASES.some((phase) => phases.has(phase))
    if (missing.length > 0 || !reachedTerminal) {
      incomplete.push({ step, missing, reachedTerminal })
    }
    steps.push({ step, phases: Object.freeze([...phases]) })
  }

  if (incomplete.length > 0) {
    return Err({
      code: 'INCOMPLETE_LOG',
      reason: `${incomplete.length} step(s) missing required TDD phases`,
      incomplete: Object.freeze(incomplete.map((s) => Object.freeze({ ...s, missing: Object.freeze(s.missing) }))),
    })
  }

  return Ok(Object.freeze({ complete: true, steps: Object.freeze(steps.map((s) => Object.freeze(s))) }))
}
