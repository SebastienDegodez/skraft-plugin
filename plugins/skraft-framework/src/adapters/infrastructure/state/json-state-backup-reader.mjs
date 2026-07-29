import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parseBackupTimestamp } from '../../../domain/recovery-policy.mjs'

// Reads the rotating state.json.bak.{ts} backups created by the atomic writer (#60).
// Restore-only: this adapter never creates, rotates, or deletes backups.
export const createJsonStateBackupReader = (basePath) => ({
  // Returns [{ name, timestamp, raw }] sorted newest-first. `raw` is the parsed JSON,
  // or null when a backup file cannot be read/parsed. Missing directory → [].
  list: async (projectSlug) => {
    const stateDir = join(basePath, projectSlug)
    let entries
    try {
      entries = await readdir(stateDir)
    } catch (err) {
      if (err.code === 'ENOENT') return []
      throw err
    }

    const backups = []
    for (const name of entries) {
      const timestamp = parseBackupTimestamp(name)
      if (!Number.isFinite(timestamp)) continue
      let raw = null
      try {
        raw = JSON.parse(await readFile(join(stateDir, name), 'utf8'))
      } catch {
        raw = null
      }
      backups.push({ name, timestamp, raw })
    }

    return backups.sort((a, b) => b.timestamp - a.timestamp)
  },
})
