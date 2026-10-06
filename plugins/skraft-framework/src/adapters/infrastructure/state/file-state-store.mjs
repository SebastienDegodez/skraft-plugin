import { Ok, Err } from '../../../domain/result.mjs'
import { parseBackupTimestamp } from '../../../domain/recovery-policy.mjs'

// StateReader, StateBackupReader and StateArchive on plain file functions, for hosts with
// no Node API (the Claude Code mod: $.fs). The Node hosts keep json-state-reader.mjs,
// json-state-backup-reader.mjs and json-state-archive.mjs; both families read and write
// the same names: state.json, state.json.bak.{ms}, state.json.corrupted.{ms},
// state.json.invalid.{ms}.
//   files — { exists(path), read(path), write(path, text), list(dir) => Promise<string[]> }
//           absolute '/'-separated paths; list answers the file names of a directory
//   now   — () => milliseconds since the epoch
const stateDir = (trackingRoot, slug) => `${trackingRoot}/${slug}`

// ENOENT when absent; invalid JSON is kept as state.json.corrupted.{ms}, then CORRUPTED_STATE.
export const createFileStateReader = ({ files, trackingRoot, now }) => Object.freeze({
  read: async (projectSlug) => {
    const path = `${stateDir(trackingRoot, projectSlug)}/state.json`
    if (!(await files.exists(path))) throw Object.assign(new Error(`${path} absent`), { code: 'ENOENT' })
    const raw = await files.read(path)
    try {
      return JSON.parse(raw)
    } catch (error) {
      await files.write(`${path}.corrupted.${now()}`, raw).catch(() => {})
      throw Object.assign(new Error(`Corrupted state.json for ${projectSlug}: ${error.message}`), { code: 'CORRUPTED_STATE' })
    }
  },
})

// [{ name, timestamp, raw }] newest first; raw null when a backup does not parse.
export const createFileStateBackupReader = ({ files, trackingRoot }) => Object.freeze({
  list: async (projectSlug) => {
    const dir = stateDir(trackingRoot, projectSlug)
    let names
    try { names = await files.list(dir) } catch { return [] }
    const backups = []
    for (const name of names) {
      const timestamp = parseBackupTimestamp(name)
      if (!Number.isFinite(timestamp)) continue
      let raw = null
      try { raw = JSON.parse(await files.read(`${dir}/${name}`)) } catch { raw = null }
      backups.push({ name, timestamp, raw })
    }
    return backups.sort((a, b) => b.timestamp - a.timestamp)
  },
})

// Keeps an invalid state.json as state.json.invalid.{ms} before a reset replaces it.
export const createFileStateArchive = ({ files, trackingRoot, now }) => Object.freeze({
  setAside: async (projectSlug) => {
    const path = `${stateDir(trackingRoot, projectSlug)}/state.json`
    const name = `state.json.invalid.${now()}`
    try {
      await files.write(`${stateDir(trackingRoot, projectSlug)}/${name}`, await files.read(path))
      return Ok(name)
    } catch (error) {
      return Err({ code: 'IO_ERROR', reason: `failed to keep the invalid state of ${projectSlug}: ${error?.message ?? error}` })
    }
  },
})
