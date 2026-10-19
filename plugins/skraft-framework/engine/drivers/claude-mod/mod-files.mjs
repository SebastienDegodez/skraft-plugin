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
  const result = await lsFiles(run, path)
  if (result.exitCode !== 0) return null
  return filesPresent(fs, path, fileNamesOf(result.stdout))
}

/** @param {ModRun} run @param {string} path */
const lsFiles = (run, path) => run(['git', '-c', 'core.quotepath=off', 'ls-files', '--cached', '--others', '-z', '--', '.'], { cwd: path })

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

/**
 * The Workspace port's one-level listing, from the files Git lists under the folder: each
 * first path part once, a folder when files sit below it; null when the path is no folder,
 * rejected with Git's reason when Git cannot list one.
 * @param {ModFs} fs @param {ModRun} run `$.process.run`
 * @returns {(path: string) => Promise<import('../../application/ports/workspace.mjs').WorkspaceEntry[] | null>}
 */
export const folderEntries = (fs, run) => async (path) => {
  const listed = await gitListing(fs, run, path)
  if (listed === null) return null
  /** @type {Map<string, 'file' | 'dir'>} */
  const entries = new Map()
  for (const [name, ...below] of listed.map((file) => file.split('/'))) entries.set(name, below.length > 0 ? 'dir' : entries.get(name) ?? 'file')
  return [...entries].map(([name, kind]) => ({ name, kind }))
}

/** @param {ModFs} fs @param {ModRun} run @param {string} path @returns {Promise<string[] | null>} */
const gitListing = async (fs, run, path) => {
  const result = await lsFiles(run, path).catch((/** @type {unknown} */ error) => ({ exitCode: null, stdout: '', stderr: String(error instanceof Error ? error.message : error) }))
  if (result.exitCode === 0) return filesPresent(fs, path, fileNamesOf(result.stdout))
  if (!(await isFolder(fs, path))) return null
  throw new Error(`git ls-files failed: ${result.stderr.trim() || `exit ${result.exitCode}`}`)
}

/** `$.fs` has no stat: a folder exists and cannot be read as a file. @param {ModFs} fs @param {string} path */
const isFolder = async (fs, path) => (await fs.exists(path)) && !(await fs.read(path).then(() => true, () => false))
