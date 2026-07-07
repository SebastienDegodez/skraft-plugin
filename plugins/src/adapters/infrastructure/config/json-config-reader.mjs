import { readFile, copyFile } from 'node:fs/promises'
import { join } from 'node:path'

// Reads the repo-wide skraft-config.json living at {basePath}/skraft-config.json.
// Detects corrupt JSON: snapshots to skraft-config.json.corrupted.{ts} then throws
// code=CORRUPTED_CONFIG. ENOENT propagates untouched (caller treats it as "no config yet").
export const createJsonConfigReader = (basePath) => ({
  read: async () => {
    const path = join(basePath, 'skraft-config.json')
    const raw = await readFile(path, 'utf8')
    try {
      return JSON.parse(raw)
    } catch (parseErr) {
      const snapshot = `${path}.corrupted.${Date.now()}`
      await copyFile(path, snapshot).catch(() => {})
      const err = new Error(`Corrupted skraft-config.json: ${parseErr.message}`)
      err.code = 'CORRUPTED_CONFIG'
      throw err
    }
  },
})
