import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Ok, Err } from '../../../domain/result.mjs'

// Keeps an invalid state.json as state.json.invalid.{ts}: the writer's rotating
// backups would drop it after three more writes.
export const createJsonStateArchive = (basePath) => ({
  setAside: async (projectSlug) => {
    const name = `state.json.invalid.${Date.now()}`
    try {
      await copyFile(join(basePath, projectSlug, 'state.json'), join(basePath, projectSlug, name))
      return Ok(name)
    } catch (err) {
      return Err({ code: 'IO_ERROR', reason: `failed to keep the invalid state of ${projectSlug}: ${err.message}` })
    }
  },
})
