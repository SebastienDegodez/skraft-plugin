import { appendFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'

/** @returns {import('../tracking/tracking-store.mjs').FileFunctions} */
export const createNodeFiles = () => Object.freeze({ read, write, append, join, list: listFiles })

/**
 * @param {string} path
 * @returns {Promise<string | null>} the text, null when the file is missing; rejects for what is
 *   no regular file (a folder, a device, a pipe), which reading could never finish or hold
 */
const read = async (path) => {
  try {
    if (!(await stat(path)).isFile()) throw Object.assign(new Error(`${path} is not a regular file`), { code: 'EISDIR' })
    return await readFile(path, 'utf8')
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return null
    throw error
  }
}

/** @param {string} path @param {string} text creates the missing folders */
const write = async (path, text) => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text, 'utf8')
}

/** @param {string} path @param {string} text creates the missing folders */
const append = async (path, text) => {
  await mkdir(dirname(path), { recursive: true })
  await appendFile(path, text, 'utf8')
}

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

/**
 * Every file under a folder, as `/`-separated paths relative to it; null when the path is not a
 * folder.
 * @param {string} path @returns {Promise<string[] | null>}
 */
const listFiles = async (path) => {
  try {
    const entries = await readdir(path, { recursive: true, withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => relative(path, join(entry.parentPath, entry.name)).split(sep).join('/'))
  } catch (error) {
    const code = /** @type {NodeJS.ErrnoException} */ (error).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return null
    throw error
  }
}
