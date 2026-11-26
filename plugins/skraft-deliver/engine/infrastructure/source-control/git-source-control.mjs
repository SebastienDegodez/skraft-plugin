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
  remoteUrl: () => remoteUrl(gitThrough(commandRunner)),
  ...gitFacts(gitThrough(commandRunner)),
  branch: (/** @type {string} */ dir) => branch(gitThrough(commandRunner), dir),
  isAncestor: (/** @type {string} */ dir, /** @type {string} */ ancestor, /** @type {string} */ descendant) => isAncestor(gitThrough(commandRunner), dir, { ancestor, descendant }),
  commitFiles: (/** @type {string} */ dir, /** @type {string[]} */ paths, /** @type {string} */ message) => commitFiles(commandRunner, dir, { paths, message }),
  retireFiles: (/** @type {string} */ dir, /** @type {string[]} */ paths, /** @type {string} */ message) => retireFiles(commandRunner, dir, { paths, message }),
  takeBase: (/** @type {string} */ dir, /** @type {string} */ sha, /** @type {string} */ message) => takeBase(commandRunner, dir, { sha, message }),
  commitCopies: (/** @type {string} */ dir, /** @type {Copy[]} */ copies, /** @type {string} */ message) => commitCopies(commandRunner, dir, { copies, message }),
  refusedImages: (/** @type {string} */ dir, /** @type {Array<{ from: string, within: string }>} */ files) => refusedOf(commandRunner, dir, files),
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

/** The URL of the working copy's remote: origin, else the first one Git lists; null without one. @param {Git} git @returns {Promise<string | null>} */
const remoteUrl = async (git) => {
  // Stryker disable next-line StringLiteral: '' and '.' are both the working copy to the CommandRunner
  const names = lines((await git('.', ['remote'])) ?? '')
  const name = names.includes('origin') ? 'origin' : names[0]
  if (name === undefined) return null
  // Stryker disable next-line StringLiteral: '' and '.' are both the working copy to the CommandRunner
  return (await git('.', ['remote', 'get-url', '--end-of-options', name]))?.trim() || null
}

/** @param {Git} git @param {string} dir @returns {Promise<string | null>} */
const repository = async (git, dir) => {
  const cdup = await git(dir, ['rev-parse', '--show-cdup'])
  return cdup === null ? null : joinRelative(dir, cdup.trim())
}

/** @param {Git} git @param {string} dir @param {{ ancestor: string, descendant: string }} commits */
const isAncestor = async (git, dir, { ancestor, descendant }) => (await git(dir, ['merge-base', '--is-ancestor', '--end-of-options', ancestor, descendant])) !== null

/** @param {Git} git @param {string} dir @param {string} ref @returns {Promise<string | null>} */
const mergeBase = async (git, dir, ref) => {
  const sha = await git(dir, ['merge-base', '--end-of-options', 'HEAD', ref])
  return sha?.trim() ?? null
}

/** @param {Git} git @param {string} dir @returns {Promise<string | null>} */
const branch = async (git, dir) => (await git(dir, ['symbolic-ref', '--quiet', '--short', 'HEAD']))?.trim() || null

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
  const log = await git(dir, ['log', '--reverse', '-z', '--name-only', '--no-renames', '--relative', '--format=%x01%H%x02%P%x02%s%x02%b', '--end-of-options', `${since}..HEAD`, '--'])
  return log === null ? null : log.split('\x01').slice(1).map(commitOf)
}

/**
 * One commit of `git log -z --name-only --format=%x01%H%x02%P%x02%s%x02%b`, its \x01 removed: sha,
 * parents, subject and body split by \x02 and closed by NUL, then its files, each closed by NUL.
 * @param {string} entry
 * @returns {import('../../application/ports/source-control.mjs').Commit}
 */
const commitOf = (entry) => {
  const [header, ...names] = entry.split('\0')
  const [sha, parents, subject, body] = header.split('\x02')
  return {
    sha,
    parent: parents.split(' ')[0],
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
 * The tracked files removed from the working copy, then their removal committed alone.
 * @param {CommandRunner} commandRunner @param {string} dir @param {{ paths: string[], message: string }} request
 */
const retireFiles = async (commandRunner, dir, { paths, message }) => {
  if (paths.length === 0) return { ok: true }
  const git = (/** @type {string[]} */ args) => commandRunner.run({ argv: ['git', ...args], cwd: dir })
  const removed = await git(['rm', '--quiet', '--', ...paths])
  if (!succeeded(removed)) return failed('git rm', removed)
  return commitStaged(git, paths, message)
}

/**
 * A commit of the default branch taken into the current branch: a fast-forward when the branch
 * holds no commit of its own, a merge commit with that message otherwise; a conflict undoes the
 * merge, leaving the branch and the working copy as they were.
 * @param {CommandRunner} commandRunner @param {string} dir @param {{ sha: string, message: string }} request
 */
const takeBase = async (commandRunner, dir, { sha, message }) => {
  const git = (/** @type {string[]} */ args) => commandRunner.run({ argv: ['git', ...args], cwd: dir })
  const merged = await git(['merge', '--no-edit', '-m', message, '--end-of-options', sha])
  if (succeeded(merged)) return { ok: /** @type {const} */ (true) }
  await git(['merge', '--abort'])
  return { ...failed('git merge', merged), conflict: true }
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
 * The files to refuse, by Git alone: one Git cannot add from its folder (missing, outside its
 * repository, beyond a symbolic link), one that is itself a symbolic link or no regular file,
 * one whose bytes do not start with the PNG signature.
 * @param {CommandRunner} commandRunner @param {string} dir @param {Array<{ from: string, within: string }>} files @returns {Promise<string[]>}
 */
const refusedOf = async (commandRunner, dir, files) => {
  const refused = []
  for (const file of files) if (!(await isPngFile(commandRunner, dir, file))) refused.push(file.from)
  return refused
}

/**
 * @param {CommandRunner} commandRunner @param {string} dir @param {{ from: string, within: string }} file
 */
const isPngFile = async (commandRunner, dir, { from, within }) => {
  const inner = innerPath(from, within)
  if (inner === null) return false
  const git = (/** @type {string[]} */ args) => commandRunner.run({ argv: ['git', ...args], cwd: joinRelative(dir, within) })
  if (!succeeded(await git(['add', '--dry-run', '--force', '--', inner]))) return false
  if (!REGULAR.test((await git(['diff', '--no-index', '--raw', '--', '/dev/null', inner])).stdout)) return false
  return startsAsPng(git, inner)
}

/** The path of a file inside its folder, null when it is not under it. @param {string} from @param {string} within */
const innerPath = (from, within) => {
  if (within === '.') return from
  return from.startsWith(`${within}/`) ? from.slice(within.length + 1) : null
}

/** What `git diff --no-index --raw` prints of a regular file added: never a symbolic link (120000). */
const REGULAR = /^:000000 100(?:644|755) /

/**
 * Whether the bytes Git stores for the file start with the PNG signature: its first byte, 0x89,
 * is no UTF-8, so the text the CommandRunner carries reads it as U+FFFD.
 * @param {GitRun} git @param {string} inner
 */
const startsAsPng = async (git, inner) => {
  const stored = await git(['hash-object', '-w', '--no-filters', '--', inner])
  if (!succeeded(stored)) return false
  const blob = await git(['cat-file', 'blob', stored.stdout.trim()])
  return succeeded(blob) && blob.stdout.startsWith(PNG_SIGNATURE)
}

/** The PNG signature as text decoded from UTF-8. */
const PNG_SIGNATURE = '\uFFFDPNG\r\n\u001a\n'

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
const failed = (what, result) => ({ ok: /** @type {const} */ (false), error: `${what} failed: ${result.error ?? `exit ${result.exitCode}`}`, output: `${result.stdout}${result.stderr}` })
