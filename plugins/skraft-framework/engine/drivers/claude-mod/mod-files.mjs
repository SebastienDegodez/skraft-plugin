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
 * `$.fs` cannot list a folder: list asks Git for the files under it, tracked or not (ignored
 * ones included), and answers null without `run`, outside a repository or when git fails.
 * @param {ModFs} fs
 * @param {{ run?: import('./mod-processes.mjs').ModRun }} [options] run: `$.process.run`
 * @returns {import('../../infrastructure/tracking/tracking-store.mjs').FileFunctions}
 */
export const createModFiles = (fs, { run } = {}) => {
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
    list: async (path) => {
      if (run === undefined) return null
      try {
        const result = await run(['git', '-c', 'core.quotepath=off', 'ls-files', '--cached', '--others', '-z', '--', '.'], { cwd: path })
        if (result.exitCode !== 0) return null
        const names = [...new Set(result.stdout.split('\0'))].filter((name) => name !== '' && !name.endsWith('/'))
        const present = await Promise.all(names.map((name) => fs.exists(joinPath(path, name))))
        return names.filter((_, index) => present[index])
      } catch {
        return null
      }
    },
  })
}

/** @param {...string} parts */
export const joinPath = (...parts) =>
  parts
    .filter((part) => part !== '')
    .map((part, index) => (index === 0 ? part.replace(/[\\/]+$/, '') : part.replace(/^[\\/]+|[\\/]+$/g, '')))
    .join('/')
