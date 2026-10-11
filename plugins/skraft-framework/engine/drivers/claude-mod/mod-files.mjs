/**
 * The FileFunctions the tracking store and the templates take, on the Claude Code mod's
 * `$.fs`: no Node API, `/` between path parts (Windows takes it too).
 *
 * @typedef {{
 *   read: (path: string) => Promise<string>,
 *   write: (path: string, text: string) => Promise<void>,
 *   exists: (path: string) => Promise<boolean>,
 * }} ModFs
 *   read rejects when the file is missing; write creates the folders.
 */

/**
 * @param {ModFs} fs
 * @returns {import('../../infrastructure/tracking/tracking-store.mjs').FileFunctions}
 */
export const createModFiles = (fs) => {
  /** @param {string} path @returns {Promise<string | null>} */
  const read = async (path) => {
    try {
      return await fs.read(path)
    } catch (error) {
      if (await fs.exists(path)) throw error
      return null
    }
  }
  return Object.freeze({
    read,
    write: (path, text) => fs.write(path, text),
    append: async (path, text) => fs.write(path, `${(await read(path)) ?? ''}${text}`),
    join: joinPath,
  })
}

/** @param {...string} parts */
export const joinPath = (...parts) =>
  parts
    .filter((part) => part !== '')
    .map((part, index) => (index === 0 ? part.replace(/[\\/]+$/, '') : part.replace(/^[\\/]+|[\\/]+$/g, '')))
    .join('/')
