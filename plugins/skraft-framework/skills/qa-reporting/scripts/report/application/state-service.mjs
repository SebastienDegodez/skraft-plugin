import { Ok, Err, isOk } from '../domain/result.mjs'
import { applyTransition, DEFAULT_PHASE_ORDER } from '../domain/state-machine.mjs'
import { validatePipelineState } from '../domain/state-schema.mjs'
import { validateReportingPreferences } from '../domain/reporting-preferences.mjs'

// Fresh pipeline shape. Carries the full documented field set so a newly-initialized
// state.json is self-describing and no downstream reader has to guess a missing field.
// The invariant-bearing subset (currentPhase, phasesCompleted, verdicts, retryCount,
// reworkCount, findingsResolved, phaseArtifacts, reviewArtifacts, userPreferences) is
// owned by the state machine; the remaining scalars are populated
// by the orchestrator (Phase 0 / DESIGN checkpoint) and only preserved here.
const DEFAULT_STATE = ({ projectSlug, phaseOrder }) => ({
  projectSlug: projectSlug ?? null,
  currentPhase: phaseOrder[0],
  adrRatification: { checkpointStatus: 'none', pending: [], ratified: [] },
  phasesCompleted: [],
  phaseArtifacts: {},
  verdicts: {},
  reviewArtifacts: {},
  retryCount: {},
  reworkCount: {},
  findingsResolved: {},
  phaseHistory: {},
  userPreferences: { maxRetriesPerPhase: 2 },
})

// Application use case: orchestrates stateReader port + stateMachine domain + stateWriter port.
// No direct filesystem access — all IO delegated to injected ports. `phaseOrder` is the
// published skraft-framework.config.json::phaseOrder; a fresh pipeline opens its first phase.
// A phase closure (transition, close-phase) is also judged by `phaseGate`, when wired:
// its violations refuse the closure with PHASE_GATE and leave the state untouched.
const CLOSING_EVENTS = new Set(['ADVANCE', 'CLOSE_PHASE'])

export const createStateService = ({ stateReader, stateWriter, phaseOrder = DEFAULT_PHASE_ORDER, phaseGate }) => {
  // Reads state, coerces on parse errors into specific error codes.
  const readState = async (projectSlug) => {
    try {
      return { ok: true, value: await stateReader.read(projectSlug) }
    } catch (err) {
      if (err.code === 'ENOENT') return { ok: false, error: { code: 'ENOENT' } }
      if (err.code === 'CORRUPTED_STATE') return { ok: false, error: { code: 'CORRUPTED_STATE', reason: err.message } }
      return { ok: false, error: { code: 'IO_ERROR', reason: err.message } }
    }
  }

  // I9: Idempotent — creates default state on ENOENT, returns existing otherwise.
  const init = async (projectSlug) => {
    const readResult = await readState(projectSlug)
    if (!readResult.ok) {
      if (readResult.error.code === 'ENOENT') {
        const defaults = DEFAULT_STATE({ projectSlug, phaseOrder })
        const writeResult = await stateWriter.write(projectSlug, defaults)
        if (!isOk(writeResult)) return writeResult
        return Ok({ ...defaults, created: true })
      }
      return Err(readResult.error)
    }
    const validation = validatePipelineState(readResult.value)
    if (!isOk(validation)) {
      return Err({ code: 'CORRUPTED_STATE', reason: validation.error.reason })
    }
    return Ok({ ...validation.value, created: false })
  }

  // read → validate (coerce) → applyTransition → write. ENOENT → auto-init + replay.
  const applyEvent = async (projectSlug, event) => {
    const readResult = await readState(projectSlug)
    let raw

    if (!readResult.ok) {
      if (readResult.error.code === 'ENOENT') {
        const defaults = DEFAULT_STATE({ projectSlug, phaseOrder })
        const writeResult = await stateWriter.write(projectSlug, defaults)
        if (!isOk(writeResult)) return writeResult
        raw = defaults
      } else {
        return Err(readResult.error)
      }
    } else {
      raw = readResult.value
    }

    const validation = validatePipelineState(raw)
    if (!isOk(validation)) {
      return Err({ code: 'INVALID_STATE', reason: validation.error.reason })
    }

    const transitionResult = applyTransition(validation.value, event, { phaseOrder })
    if (!isOk(transitionResult)) return transitionResult

    if (phaseGate && CLOSING_EVENTS.has(event.type)) {
      const phase = validation.value.currentPhase
      const violations = await phaseGate.check(projectSlug, validation.value, phase, { closingArtifact: event.path })
      if (violations.length > 0) {
        return Err({
          code: 'PHASE_GATE',
          reason: `${phase} cannot close: ${violations.map((v) => `${v.code} — ${v.reason}`).join('; ')}`,
          violations,
        })
      }
    }

    const writeResult = await stateWriter.write(projectSlug, transitionResult.value)
    if (!isOk(writeResult)) return writeResult

    return Ok(transitionResult.value)
  }

  // Read-only. No write, no backup. Returns state[field] or full state.
  const get = async (projectSlug, field) => {
    const readResult = await readState(projectSlug)
    if (!readResult.ok) return Err(readResult.error)
    if (field !== undefined) return Ok(readResult.value[field])
    return Ok(readResult.value)
  }

  const configureReporting = async (projectSlug, prefs) => {
    const preferencesResult = validateReportingPreferences(prefs)
    if (!isOk(preferencesResult)) return preferencesResult

    const reporting = { ...preferencesResult.value, destinations: { ...preferencesResult.value.destinations } }
    const readResult = await readState(projectSlug)
    if (!isOk(readResult)) return Err(readResult.error)

    const raw = readResult.value
    const validation = validatePipelineState(raw)
    if (!isOk(validation)) return validation

    // Validate intrinsic state without persisting unrelated coercions or transitions.
    const updated = { ...raw, userPreferences: { ...raw.userPreferences, reporting } }
    const writeResult = await stateWriter.write(projectSlug, updated)
    if (!isOk(writeResult)) return writeResult
    return Ok(updated)
  }

  // Writes a fresh pipeline over whatever state.json holds. Only the recovery reset
  // calls it, once it has kept the file it replaces.
  const reinitialize = async (projectSlug) => {
    const defaults = DEFAULT_STATE({ projectSlug, phaseOrder })
    const writeResult = await stateWriter.write(projectSlug, defaults)
    if (!isOk(writeResult)) return writeResult
    return Ok(defaults)
  }

  return { init, applyEvent, get, configureReporting, reinitialize }
}
