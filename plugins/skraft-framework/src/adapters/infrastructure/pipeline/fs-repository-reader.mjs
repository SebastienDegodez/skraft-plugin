import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// RepositoryReader (ports/infrastructure/repository-reader.mjs) on the local file system.
export const createFsRepositoryReader = ({ cwd }) => Object.freeze({
  read: async (path) => {
    try { return await readFile(join(cwd, path), 'utf8') } catch { return null }
  },
})
