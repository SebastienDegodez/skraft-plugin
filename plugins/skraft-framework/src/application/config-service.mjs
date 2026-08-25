import { Ok, Err, isOk } from '../domain/result.mjs'
import { validateConfig, TRACKING_LAYOUTS, DEFAULT_TRACKING_LAYOUT } from '../domain/config-schema.mjs'

const DEFAULT_CONFIG = () => ({ trackingLayout: DEFAULT_TRACKING_LAYOUT })

// Keys the CLI may `set`, each with its own value validator. trackingLayout switches
// the artefact/state substrate (namespaced legacy vs bare RPI-shared). Extra
// human-authored fields are preserved on read/write but are not settable through the
// guarded `set` path (edit the file directly for those).
const SETTABLE_KEYS = {
  trackingLayout: (value) => TRACKING_LAYOUTS.includes(value),
}

// Application use case: orchestrates configReader port + config-schema domain +
// configWriter port. No direct filesystem access — all IO delegated to injected ports.
export const createConfigService = ({ configReader, configWriter }) => {
  const readConfig = async () => {
    try {
      return { ok: true, value: await configReader.read() }
    } catch (err) {
      if (err.code === 'ENOENT') return { ok: false, error: { code: 'ENOENT' } }
      if (err.code === 'CORRUPTED_CONFIG') return { ok: false, error: { code: 'CORRUPTED_CONFIG', reason: err.message } }
      return { ok: false, error: { code: 'IO_ERROR', reason: err.message } }
    }
  }

  // Idempotent — creates default config on ENOENT, returns existing otherwise.
  const init = async () => {
    const readResult = await readConfig()
    if (!readResult.ok) {
      if (readResult.error.code === 'ENOENT') {
        const defaults = DEFAULT_CONFIG()
        const writeResult = await configWriter.write(defaults)
        if (!isOk(writeResult)) return writeResult
        return Ok({ ...defaults, created: true })
      }
      return Err(readResult.error)
    }
    const validation = validateConfig(readResult.value)
    if (!isOk(validation)) return Err({ code: 'CORRUPTED_CONFIG', reason: validation.error.reason })
    return Ok({ ...validation.value, created: false })
  }

  // Read-only. No write. ENOENT → validated default (never persisted). Returns
  // config[key] or the whole validated config.
  const get = async (key) => {
    const readResult = await readConfig()
    let raw
    if (!readResult.ok) {
      if (readResult.error.code === 'ENOENT') raw = DEFAULT_CONFIG()
      else return Err(readResult.error)
    } else {
      raw = readResult.value
    }
    const validation = validateConfig(raw)
    if (!isOk(validation)) return Err({ code: 'CORRUPTED_CONFIG', reason: validation.error.reason })
    if (key !== undefined) return Ok(validation.value[key])
    return Ok(validation.value)
  }

  // Guarded write of one settable key. Validates the value, preserves every other
  // field, then persists. ENOENT → starts from default before applying.
  const set = async (key, value) => {
    const validator = SETTABLE_KEYS[key]
    if (validator === undefined) {
      return Err({ code: 'UNKNOWN_KEY', reason: `unknown config key: ${key}` })
    }
    if (!validator(value)) {
      return Err({ code: 'INVALID_VALUE', reason: `invalid value for ${key}: ${value}` })
    }

    const readResult = await readConfig()
    let raw
    if (!readResult.ok) {
      if (readResult.error.code === 'ENOENT') raw = DEFAULT_CONFIG()
      else return Err(readResult.error)
    } else {
      raw = readResult.value
    }

    const validation = validateConfig(raw)
    if (!isOk(validation)) return Err({ code: 'CORRUPTED_CONFIG', reason: validation.error.reason })

    const next = { ...validation.value, [key]: value }
    const writeResult = await configWriter.write(next)
    if (!isOk(writeResult)) return writeResult
    return Ok(next)
  }

  return { init, get, set }
}
