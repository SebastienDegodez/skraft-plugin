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
  commitFiles: (/** @type {string} */ dir, /** @type {string[]} */ paths, /** @type {string} */ message) => commitFiles(commandRunner, dir, { paths, message }),
  commitCopies: (/** @type {string} */ dir, /** @type {Copy[]} */ copies, /** @type {string} */ message) => commitCopies(commandRunner, dir, { copies, message }),
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
  existsAt: (/** @type {string} */ dir, /** @type {string} */ sha, /** @type {string} */ path) => existsAt(git, dir, `${sha}:./${path}`),
  show: (/** @type {string} */ dir, /** @type {string} */ sha, /** @type {string} */ path) => git(dir, ['show', '--no-textconv', `${sha}:./${path}`]),
  filesAt: (/** @type {string} */ dir, /** @type {string} */ sha) => filesAt(git, dir, sha),
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

/** @param {Git} git @param {string} dir @param {string} object `<sha>:./<path>` @returns {Promise<boolean>} */
const existsAt = async (git, dir, object) => (await git(dir, ['cat-file', '-e', object])) !== null

/** The files a commit holds under the folder, relative to it. @param {Git} git @param {string} dir @param {string} sha */
const filesAt = async (git, dir, sha) => {
  const listed = await git(dir, ['ls-tree', '-r', '-z', '--name-only', '--end-of-options', sha])
  return listed === null ? null : listed.split('\0').filter((path) => path !== '')
}

/** @param {Git} git @param {string} dir @returns {Promise<string | null>} null before the first commit */
const head = async (git, dir) => {
  const sha = await git(dir, ['rev-parse', '--verify', '--quiet', 'HEAD'])
  return sha?.trim() || null
}

/**
 * The commits after `since` up to HEAD, oldest first, each with its subject, its body and the
 * files it changed relative to the folder; null when git cannot list them.
 * @param {Git} git @param {string} dir @param {string} since
 */
const commits = async (git, dir, since) => {
  const log = await git(dir, ['log', '--reverse', '-z', '--name-only', '--no-renames', '--relative', '--format=%x01%H%x02%s%x02%b', '--end-of-options', `${since}..HEAD`, '--'])
  return log === null ? null : log.split('\x01').slice(1).map(commitOf)
}

/**
 * One commit of `git log -z --name-only --format=%x01%H%x02%s%x02%b`, its \x01 removed: sha,
 * subject and body split by \x02 and closed by NUL, then its files, each closed by NUL.
 * @param {string} entry
 * @returns {import('../../application/ports/source-control.mjs').Commit}
 */
const commitOf = (entry) => {
  const [header, ...names] = entry.split('\0')
  const [sha, subject, body] = header.split('\x02')
  return {
    sha,
    subject,
    body: body.trimEnd(),
    files: names.map((name) => name.replace(/^\r?\n/, '')).filter((name) => name !== ''),
  }
}

/** @param {string} text @returns {string[]} */
const lines = (text) => text.split(/\r?\n/).filter((line) => line !== '')

/**
 * Stages the files and commits them alone; no file, or nothing staged for them, is no commit, and ok.
 * @param {CommandRunner} commandRunner @param {string} dir @param {{ paths: string[], message: string }} change
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
const commitFiles = async (commandRunner, dir, { paths, message }) => {
  if (paths.length === 0) return { ok: true }
  const git = (/** @type {string[]} */ args) => commandRunner.run({ argv: ['git', ...args], cwd: dir })
  const added = await git(['add', '--', ...paths])
  if (!succeeded(added)) return failed('git add', added)
  return commitStaged(git, paths, message)
}

/**
 * @typedef {{ from: string, to: string, within: string }} Copy
 * @typedef {(args: string[]) => ReturnType<CommandRunner['run']>} GitRun
 */

/**
 * Copies each file byte for byte through Git's object store, ignored or not, then commits the
 * copies alone; none when one of them is refused. Git writes the bytes: the CommandRunner only
 * carries text. What a failed call staged is unstaged.
 * @param {CommandRunner} commandRunner @param {string} dir @param {{ copies: Copy[], message: string }} change
 * @returns {Promise<{ ok: true } | { ok: false, error: string, refused?: string[] }>}
 */
const commitCopies = async (commandRunner, dir, { copies, message }) => {
  const refused = await refusedOf(commandRunner, dir, copies)
  if (refused.length > 0) return { ok: false, error: `refused ${refused.length} files`, refused }
  const git = (/** @type {string[]} */ args) => commandRunner.run({ argv: ['git', ...args], cwd: dir })
  const made = await copiedAndCommitted(git, copies, message)
  if (!made.ok) await git(['reset', '--quiet', '--', ...copies.map(({ to }) => to)])
  return made
}

/**
 * @param {GitRun} git @param {Copy[]} copies @param {string} message
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
const copiedAndCommitted = async (git, copies, message) => {
  for (const copy of copies) {
    if (!(await copied(git, copy))) return { ok: false, error: `git could not copy ${copy.from}` }
  }
  return commitStaged(git, copies.map(({ to }) => to), message)
}

/**
 * Node, by the script INSPECT, says which files to refuse: a symbolic link, one whose real path
 * leaves its folder, one that does not start with the PNG signature or cannot be read. Every
 * file is refused when Node cannot run.
 * @param {CommandRunner} commandRunner @param {string} dir @param {Copy[]} copies @returns {Promise<string[]>}
 */
const refusedOf = async (commandRunner, dir, copies) => {
  const result = await commandRunner.run({ argv: ['node', '-e', INSPECT, '--', ...copies.flatMap(({ within, from }) => [within, from])], cwd: dir })
  const accepted = result.started && result.exitCode === 0 ? new Set(lines(result.stdout)) : new Set()
  return copies.map(({ from }) => from).filter((from) => !accepted.has(from))
}

/**
 * Prints each file of its (folder, file) argument pairs that may be copied. It runs in a child
 * Node, never in the module that loads this file: its globals are reached through `module` and
 * `globalThis`, which the mod's import check leaves alone.
 */
const INSPECT = [
  "const { closeSync, lstatSync, openSync, readSync, realpathSync } = module.require('node:fs')",
  "const { isAbsolute, relative, sep } = module.require('node:path')",
  'const SIGNATURE = globalThis.Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])',
  'const isPng = (path) => { const fd = openSync(path, "r"); const head = globalThis.Buffer.alloc(8); readSync(fd, head, 0, 8, 0); closeSync(fd); return head.equals(SIGNATURE) }',
  'const inside = (folder, path) => { const rel = relative(realpathSync(folder), realpathSync(path)); return rel !== "" && !isAbsolute(rel) && rel.split(sep)[0] !== ".." }',
  'const args = globalThis.process.argv.slice(1)',
  'for (let i = 0; i < args.length; i += 2) {',
  '  try { if (!lstatSync(args[i + 1]).isSymbolicLink() && inside(args[i], args[i + 1]) && isPng(args[i + 1])) console.log(args[i + 1]) } catch {}',
  '}',
].join('\n')

/**
 * Commits the staged paths alone, ignored ones included; nothing staged for them is no commit, and ok.
 * @param {(args: string[]) => ReturnType<CommandRunner['run']>} git @param {string[]} paths @param {string} message
 */
const commitStaged = async (git, paths, message) => {
  if (succeeded(await git(['diff', '--cached', '--quiet', '--', ...paths]))) return { ok: /** @type {const} */ (true) }
  const made = await git(['commit', '--quiet', '-m', message, '--', ...paths])
  return succeeded(made) ? { ok: /** @type {const} */ (true) } : failed('git commit', made)
}

/**
 * The file stored as a blob, without any filter, staged at `to`, then written there from the index.
 * @param {GitRun} git @param {Copy} copy
 */
const copied = async (git, { from, to }) => {
  const stored = await git(['hash-object', '-w', '--no-filters', '--', from])
  if (!succeeded(stored)) return false
  const staged = await git(['update-index', '--add', '--cacheinfo', `100644,${stored.stdout.trim()},${to}`])
  return succeeded(staged) && succeeded(await git(['checkout-index', '--force', '--', to]))
}

/** @param {import('../../application/ports/command-runner.mjs').CommandResult} result */
const succeeded = (result) => result.started && result.exitCode === 0

/** @param {string} what @param {import('../../application/ports/command-runner.mjs').CommandResult} result */
// The tool's stderr stays out: it reaches the journal, an outcome and the next prompts. result.error is fixed by the runner.
const failed = (what, result) => ({ ok: /** @type {const} */ (false), error: `${what} failed: ${result.error ?? `exit ${result.exitCode}`}` })
