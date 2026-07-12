import { Ok, Err, isOk } from '../domain/result.mjs'
import { appendEntry, verifyIntegrity as verifyIntegrityDomain, validateLog } from '../domain/execution-log-schema.mjs'

// Fresh execution-log shape for a project slug. createdAt is stamped with the real UTC
// clock (injected time port) so the log is deterministic and machine-comparable.
const DEFAULT_LOG = (slug, now) => ({
  slug,
  createdAt: now,
  entries: [],
})

// Application use case (S7 tool bridge): orchestrates logReader + logWriter ports, the
// execution-log-schema domain, and the clock port. No direct filesystem or Date access —
// all IO/time delegated to injected ports so the DELIVER agent's TDD progress is recorded
// deterministically instead of merely asserted.
export const createExecutionLogService = ({ logReader, logWriter, clock }) => {
  const readLog = async (slug) => {
    try {
      return { ok: true, value: await logReader.read(slug) }
    } catch (err) {
      if (err.code === 'ENOENT') return { ok: false, error: { code: 'ENOENT' } }
      if (err.code === 'CORRUPTED_LOG') return { ok: false, error: { code: 'CORRUPTED_LOG', reason: err.message } }
      return { ok: false, error: { code: 'IO_ERROR', reason: err.message } }
    }
  }

  // Idempotent — creates an empty log on ENOENT, returns the existing one otherwise.
  const init = async (slug) => {
    const readResult = await readLog(slug)
    if (!readResult.ok) {
      if (readResult.error.code === 'ENOENT') {
        const defaults = DEFAULT_LOG(slug, clock.isoString())
        const writeResult = await logWriter.write(slug, defaults)
        if (!isOk(writeResult)) return writeResult
        return Ok({ ...defaults, created: true })
      }
      return Err(readResult.error)
    }
    const validation = validateLog(readResult.value)
    if (!isOk(validation)) return Err({ code: 'CORRUPTED_LOG', reason: validation.error.reason })
    return Ok({ ...validation.value, created: false })
  }

  // Appends a timestamped (real UTC) entry, validated against the schema, then persists.
  // ENOENT → auto-init an empty log before appending, so log-phase never needs init first.
  const logPhase = async (slug, { step, phase, note }) => {
    const readResult = await readLog(slug)
    let raw
    if (!readResult.ok) {
      if (readResult.error.code === 'ENOENT') {
        raw = DEFAULT_LOG(slug, clock.isoString())
      } else {
        return Err(readResult.error)
      }
    } else {
      raw = readResult.value
    }

    const validation = validateLog(raw)
    if (!isOk(validation)) return Err({ code: 'CORRUPTED_LOG', reason: validation.error.reason })

    const entry = { step, phase, timestamp: clock.isoString() }
    if (note !== undefined) entry.note = note

    const appended = appendEntry(validation.value, entry)
    if (!isOk(appended)) return appended

    const writeResult = await logWriter.write(slug, appended.value)
    if (!isOk(writeResult)) return writeResult

    return Ok(entry)
  }

  // Read-only completeness check. Fails if any step is missing required TDD phases.
  const verifyIntegrity = async (slug) => {
    const readResult = await readLog(slug)
    if (!readResult.ok) {
      if (readResult.error.code === 'ENOENT') {
        return Err({ code: 'INCOMPLETE_LOG', reason: `no execution log found for ${slug}`, incomplete: [] })
      }
      return Err(readResult.error)
    }
    return verifyIntegrityDomain(readResult.value)
  }

  return { init, logPhase, verifyIntegrity }
}
