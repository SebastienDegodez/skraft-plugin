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
 * @typedef {import('./mod-processes.mjs').ModRun} ModRun
 */

/**
 * `$.fs` cannot list a folder: list asks Git for the files under it, tracked or not (ignored
 * ones included), and answers null without `run`, outside a repository or when git fails.
 * @param {ModFs} fs
 * @param {{ run?: ModRun }} [options] run: `$.process.run`
 * @returns {import('../../infrastructure/tracking/tracking-store.mjs').FileFunctions}
 */
export const createModFiles = (fs, { run } = {}) => Object.freeze({
  read: (path) => readOrNull(fs, path),
  write: (path, text) => fs.write(path, text),
  append: (path, text) => appendText(fs, path, text),
  join: joinPath,
  list: (path) => listFiles(fs, run, path),
})

/** A missing file reads as null; a file that exists but cannot be read rejects. @param {ModFs} fs @param {string} path @returns {Promise<string | null>} */
const readOrNull = async (fs, path) => {
  try {
    return await fs.read(path)
  } catch (error) {
    if (await fs.exists(path)) throw error
    return null
  }
}

/** @param {ModFs} fs @param {string} path @param {string} text */
const appendText = async (fs, path, text) => fs.write(path, `${(await readOrNull(fs, path)) ?? ''}${text}`)

/** @param {ModFs} fs @param {ModRun | undefined} run @param {string} path @returns {Promise<string[] | null>} */
const listFiles = async (fs, run, path) => {
  if (run === undefined) return null
  try {
    return await filesGitLists(fs, run, path)
  } catch {
    return null
  }
}

/** @param {ModFs} fs @param {ModRun} run @param {string} path @returns {Promise<string[] | null>} */
const filesGitLists = async (fs, run, path) => {
  const result = await run(['git', '-c', 'core.quotepath=off', 'ls-files', '--cached', '--others', '-z', '--', '.'], { cwd: path })
  if (result.exitCode !== 0) return null
  return filesPresent(fs, path, fileNamesOf(result.stdout))
}

/** The file names in `git ls-files -z` output, once each; a folder entry is no file. @param {string} stdout */
const fileNamesOf = (stdout) => [...new Set(stdout.split('\0'))].filter((name) => name !== '' && !name.endsWith('/'))

/** The names, in order, whose file is still on disk. @param {ModFs} fs @param {string} path @param {string[]} names */
const filesPresent = async (fs, path, names) => {
  const present = await Promise.all(names.map((name) => fs.exists(joinPath(path, name))))
  return names.filter((_, index) => present[index])
}

/** @param {...string} parts */
export const joinPath = (...parts) =>
  parts
    .filter((part) => part !== '')
    .map((part, index) => (index === 0 ? part.replace(/[\\/]+$/, '') : part.replace(/^[\\/]+|[\\/]+$/g, '')))
    .join('/')
