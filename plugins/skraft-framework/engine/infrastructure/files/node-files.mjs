import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
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
