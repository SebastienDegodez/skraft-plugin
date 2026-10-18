import { joinRelative } from '../../domain/config/relative-path.mjs'

/**
 * @typedef {import('../../application/ports/command-runner.mjs').CommandRunner} CommandRunner
 * @typedef {(dir: string, args: string[]) => Promise<string | null>} Git stdout, null when git failed
 */

/**
 * SourceControl on the `git` command, through any host's CommandRunner: Node's processes or
 * the Claude Code mod's `$.process.run`. No Node API here.
 * @param {{ commandRunner: CommandRunner }} options
 * @returns {import('../../application/ports/source-control.mjs').SourceControl}
 */
export const createGitSourceControl = ({ commandRunner }) => Object.freeze({
  unavailable: () => unavailable(commandRunner),
  ...gitFacts(gitThrough(commandRunner)),
})

/** @param {Git} git */
const gitFacts = (git) => ({
  repository: (/** @type {string} */ dir) => repository(git, dir),
  mergeBase: (/** @type {string} */ dir, /** @type {string} */ ref) => mergeBase(git, dir, ref),
  changedFiles: (/** @type {string} */ dir, /** @type {string} */ sha) => changedFiles(git, dir, sha),
  head: (/** @type {string} */ dir) => head(git, dir),
  files: (/** @type {string} */ dir) => files(git, dir),
  commits: (/** @type {string} */ dir, /** @type {string} */ since) => commits(git, dir, since),
  diff: (/** @type {string} */ dir, /** @type {string} */ sha) => git(dir, ['diff', ...PATCH_OPTIONS, '--end-of-options', sha, '--']),
})

/**
 * A patch whose paths read `a/<path>` and `b/<path>` relative to the folder, whatever the user's
 * diff config, that shows every file's real text: no attribute (`-diff`, a textconv driver) of
 * the repository can turn a file into "Binary files differ" or rewrite what it holds.
 */
const PATCH_OPTIONS = Object.freeze(['--no-renames', '--no-color', '--no-ext-diff', '--no-textconv', '--text', '--src-prefix=a/', '--dst-prefix=b/', '--relative'])

/** @param {CommandRunner} commandRunner @returns {Git} */
const gitThrough = (commandRunner) => async (dir, args) => {
  const result = await commandRunner.run({ argv: ['git', '-c', 'core.quotepath=off', ...args], cwd: dir })
  return result.started && result.exitCode === 0 ? result.stdout : null
}

/** @param {CommandRunner} commandRunner @returns {Promise<string | null>} why git cannot start, null when it can */
const unavailable = async (commandRunner) => {
  // Stryker disable next-line StringLiteral: '' and '.' are both the working copy to the CommandRunner
  const result = await commandRunner.run({ argv: ['git', '--version'], cwd: '.' })
  return result.started ? null : /** @type {string} */ (result.error)
}

/** @param {Git} git @param {string} dir @returns {Promise<string | null>} */
const repository = async (git, dir) => {
  const cdup = await git(dir, ['rev-parse', '--show-cdup'])
  return cdup === null ? null : joinRelative(dir, cdup.trim())
}

/** @param {Git} git @param {string} dir @param {string} ref @returns {Promise<string | null>} */
const mergeBase = async (git, dir, ref) => {
  const sha = await git(dir, ['merge-base', '--end-of-options', 'HEAD', ref])
  return sha?.trim() ?? null
}

/**
 * Files changed since the commit, untracked files included, relative to the folder.
 * @param {Git} git @param {string} dir @param {string} sha @returns {Promise<string[] | null>}
 */
const changedFiles = async (git, dir, sha) => {
  const changed = await git(dir, ['diff', '--name-only', '--no-renames', '--relative', '--end-of-options', sha, '--'])
  const untracked = await git(dir, ['ls-files', '--others', '--exclude-standard'])
  if (changed === null) return null
  // Stryker disable next-line StringLiteral: git lists untracked files wherever it can diff, so the fallback never applies
  return [...new Set([...lines(changed), ...lines(untracked ?? '')])]
}

/**
 * The files Git lists under the folder, tracked or untracked and not ignored, relative to it.
 * @param {Git} git @param {string} dir @returns {Promise<string[] | null>}
 */
const files = async (git, dir) => {
  const listed = await git(dir, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
  return listed === null ? null : listed.split('\0').filter((name) => name !== '')
}

/** @param {Git} git @param {string} dir @returns {Promise<string | null>} null before the first commit */
const head = async (git, dir) => {
  const sha = await git(dir, ['rev-parse', '--verify', '--quiet', 'HEAD'])
  return sha?.trim() || null
}

/**
 * The commits after `since` up to HEAD, oldest first, each with the files it changed relative
 * to the folder; null when git cannot list them.
 * @param {Git} git @param {string} dir @param {string} since
 */
const commits = async (git, dir, since) => {
  const log = await git(dir, ['log', '--reverse', '-z', '--name-only', '--no-renames', '--relative', '--format=%x01%H%x02%s', '--end-of-options', `${since}..HEAD`, '--'])
  return log === null ? null : log.split('\x01').slice(1).map(commitOf)
}

/**
 * One commit of `git log -z --name-only --format=%x01%H%x02%s`, its \x01 removed: sha and
 * subject split by \x02 and closed by NUL, then its files, each closed by NUL.
 * @param {string} entry
 * @returns {import('../../application/ports/source-control.mjs').Commit}
 */
const commitOf = (entry) => {
  const [header, ...names] = entry.split('\0')
  const separator = header.indexOf('\x02')
  return {
    sha: header.slice(0, separator),
    subject: header.slice(separator + 1),
    files: names.map((name) => name.replace(/^\r?\n/, '')).filter((name) => name !== ''),
  }
}

/** @param {string} text @returns {string[]} */
const lines = (text) => text.split(/\r?\n/).filter((line) => line !== '')
