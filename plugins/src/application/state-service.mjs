import { Ok, Err, isOk } from '../domain/result.mjs'
import { applyTransition } from '../domain/state-machine.mjs'
import { validatePipelineState } from '../domain/state-schema.mjs'

const DEFAULT_STATE = () => ({
  currentPhase: 'DISCOVER',
  phasesCompleted: [],
  verdicts: {},
  retryCount: {},
  phaseArtifacts: {},
  reviewArtifacts: {},
  difficulty: null,
  userPreferences: { maxRetriesPerPhase: 2 },
})

// Application use case: orchestrates stateReader port + stateMachine domain + stateWriter port.
// No direct filesystem access — all IO delegated to injected ports.
export const createStateService = ({ stateReader, stateWriter }) => {
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
        const defaults = DEFAULT_STATE()
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
        const defaults = DEFAULT_STATE()
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

    const transitionResult = applyTransition(validation.value, event)
    if (!isOk(transitionResult)) return transitionResult

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

  return { init, applyEvent, get }
}
