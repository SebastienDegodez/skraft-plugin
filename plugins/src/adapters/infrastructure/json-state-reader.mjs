import { readFile, copyFile } from 'node:fs/promises'

export const createJsonStateReader = (basePath) => ({
  // State lives at {basePath}/{projectSlug}/state.json for each tracked project.
  // Detects corrupt JSON: snapshots to state.json.corrupted.{ts} then throws code=CORRUPTED_STATE.
  read: async (projectSlug) => {
    const path = `${basePath}/${projectSlug}/state.json`
    const raw = await readFile(path, 'utf8')
    try {
      return JSON.parse(raw)
    } catch (parseErr) {
      const snapshot = `${path}.corrupted.${Date.now()}`
      await copyFile(path, snapshot).catch(() => {})
      const err = new Error(`Corrupted state.json for ${projectSlug}: ${parseErr.message}`)
      err.code = 'CORRUPTED_STATE'
      throw err
    }
  },
})
