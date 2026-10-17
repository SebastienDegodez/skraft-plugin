import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** @returns {import('../tracking/tracking-store.mjs').FileFunctions} */
export const createNodeFiles = () => Object.freeze({
  read: async (path) => {
    try {
      return await readFile(path, 'utf8')
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return null
      throw error
    }
  },
  write: async (path, text) => {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, text, 'utf8')
  },
  append: async (path, text) => {
    await mkdir(dirname(path), { recursive: true })
    await appendFile(path, text, 'utf8')
  },
  join,
})

/**
 * A folder's entries, null when the path is not a folder.
 * @param {string} path
 * @returns {Promise<import('../../application/ports/workspace.mjs').WorkspaceEntry[] | null>}
 */
export const listFolder = async (path) => {
  try {
    const entries = await readdir(path, { withFileTypes: true })
    return entries.map((entry) => ({ name: entry.name, kind: entry.isDirectory() ? /** @type {const} */ ('dir') : /** @type {const} */ ('file') }))
  } catch (error) {
    const code = /** @type {NodeJS.ErrnoException} */ (error).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return null
    throw error
  }
}
