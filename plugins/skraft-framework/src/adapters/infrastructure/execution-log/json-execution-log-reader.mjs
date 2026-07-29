import { readFile, copyFile } from 'node:fs/promises'
import { join } from 'node:path'

// Reads the DELIVER execution log living at {basePath}/{slug}/execution-log.json.
// Detects corrupt JSON: snapshots to execution-log.json.corrupted.{ts} then throws
// code=CORRUPTED_LOG. ENOENT propagates untouched (caller treats it as "no log yet").
export const createJsonExecutionLogReader = (basePath) => ({
  read: async (slug) => {
    const path = join(basePath, slug, 'execution-log.json')
    const raw = await readFile(path, 'utf8')
    try {
      return JSON.parse(raw)
    } catch (parseErr) {
      const snapshot = `${path}.corrupted.${Date.now()}`
      await copyFile(path, snapshot).catch(() => {})
      const err = new Error(`Corrupted execution-log.json for ${slug}: ${parseErr.message}`)
      err.code = 'CORRUPTED_LOG'
      throw err
    }
  },
})
