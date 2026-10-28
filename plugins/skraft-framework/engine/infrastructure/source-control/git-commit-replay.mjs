/**
 * @typedef {import('../../application/ports/command-runner.mjs').CommandRunner} CommandRunner
 * @typedef {import('../../application/ports/command-runner.mjs').CommandResult} CommandResult
 * @typedef {import('../../application/ports/commit-replay.mjs').ReplayRequest} Replay
 * @typedef {{ path: string, installed: string[] }} LinkedWorktree
 *   path: the worktree, absolute; installed: the dependency folders the working copy installed,
 *   relative to the repository top
 * @typedef {{ path: string, lock: string, stale: string[] }} ReplayFolder
 *   path: a new empty folder of this replay alone; lock: the reason its worktree is locked with;
 *   stale: the worktrees of earlier replays of the repository that no replay runs in any more
 */

/** The folders dependencies are installed into, which Git ignores and a checkout lacks: npm's, and Python's virtual environment. */
const DEPENDENCY_FOLDERS = Object.freeze(['node_modules', '.venv'])

/** How long a git or node step of a replay may take; the replayed program has the runner's own limit. */
const STEP_TIMEOUT_MS = 300_000

/**
 * CommitReplay on `git worktree`, through any host's CommandRunner: a detached, locked,
 * throwaway worktree in a folder of its own, outside the repository and its git dir, where
 * tools that skip folders named `.git` (Vite) see its files:
 * `<tmp>/skraft-replay-<uid>/<repository id>/<sha>-<random>`, the parent the user's own; it is
 * removed once the program ends. The dependency folders the working copy installed are linked
 * into it, at the same places, and unlinked before Git removes it. Each replay first sweeps the
 * worktrees earlier replays of the repository left. No Node API here.
 * @param {{ commandRunner: CommandRunner }} options
 * @returns {import('../../application/ports/commit-replay.mjs').CommitReplay}
 */
export const createGitCommitReplay = ({ commandRunner }) =>
  Object.freeze({
    run: (replay) => replayCommit(commandRunner, replay),
  })

/** Find where the worktree goes, then replay in it. @param {CommandRunner} commandRunner @param {Replay} replay */
const replayCommit = async (commandRunner, replay) => {
  const { repository, sha } = replay
  if (!/^[0-9a-f]{4,64}$/i.test(sha)) return notCheckedOut(replay, 'not a commit sha')
  const common = await git(commandRunner, repository, ['rev-parse', '--git-common-dir'])
  if (!succeeded(common)) return notCheckedOut(replay, 'Git cannot tell where the repository keeps its data')
  const folder = await replayFolder(commandRunner, replay, common.stdout.trim())
  if (folder === null) return notCheckedOut(replay, 'no folder outside the repository to check it out in')
  return replayInWorktree(commandRunner, replay, folder)
}

/**
 * Node makes the replay's own folder and says which worktrees of the repository are stale.
 * @param {CommandRunner} commandRunner @param {Replay} replay @param {string} commonDir
 * @returns {Promise<ReplayFolder | null>} null when the machine has no folder of the user's own for it
 */
const replayFolder = async (commandRunner, { repository, sha }, commonDir) => {
  const listed = await git(commandRunner, repository, ['worktree', 'list', '--porcelain'])
  const made = await node(commandRunner, REPLAY_FOLDER, [repository, commonDir, sha, ...worktreesOf(listed.stdout)])
  return succeeded(made) ? JSON.parse(made.stdout) : null
}

/**
 * The repository's worktrees as `git worktree list --porcelain` tells them, each block opening on
 * its `worktree <path>` line: each one's path then `lock:<reason>` when it is locked, `-`
 * when it is not; never an empty argument, which a cmd.exe shim would drop.
 * @param {string} text @returns {string[]}
 */
const worktreesOf = (text) => text.split(/\r?\n\r?\n/).flatMap((block) => worktreeOf(block.split(/\r?\n/)))

/** @param {string[]} lines the block's lines, the first naming its path @returns {string[]} */
const worktreeOf = ([first, ...rest]) => {
  const locked = rest.find((line) => /^locked(?: |$)/.test(line))
  return [first.slice('worktree '.length), locked === undefined ? '-' : `lock:${locked.slice('locked'.length).trim()}`]
}

/**
 * Makes `<tmp>/skraft-replay-<uid>/<id>/<sha>-<random>` and prints it as JSON, with the reason
 * its worktree is locked with and the stale worktrees among its arguments (path, lock reason
 * pairs). The parent must be a folder of the user's own that no one else may enter; the id is
 * the first 12 hex of the SHA-256 of the git common dir's path, so that two clones never share
 * one. Empty folders under the parent and the id go first. A worktree of the id is stale when it
 * is not locked, or locked by a replay more than 6 hours ago: no replay runs that long. Paths are
 * compared in the form the system itself gives, as Git writes them: Git for Windows lists a
 * worktree under its long name where the temporary folder holds a short one (`RUNNER~1`), and a
 * folder may be spelt in another case; only the native realpath turns both into one. One line,
 * so that a `node` that is a cmd.exe shim does not cut it.
 */
const REPLAY_FOLDER = "const { createHash } = module.require('node:crypto'); const { lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmdirSync } = module.require('node:fs'); const { tmpdir } = module.require('node:os'); const { join, resolve, sep } = module.require('node:path'); const proc = globalThis.process; const [repository, commonDir, sha, ...pairs] = proc.argv.slice(1); const uid = proc.getuid ? proc.getuid() : null; const parent = join(tmpdir(), 'skraft-replay-' + (uid === null ? 'user' : uid)); mkdirSync(parent, { recursive: true, mode: 0o700 }); const owned = lstatSync(parent); if (!owned.isDirectory() || (uid !== null && (owned.uid !== uid || (owned.mode & 0o077) !== 0))) proc.exit(3); const id = join(parent, createHash('sha256').update(resolve(repository, commonDir)).digest('hex').slice(0, 12)); const empties = (folder) => { for (const entry of readdirSync(folder, { withFileTypes: true })) if (entry.isDirectory()) { try { rmdirSync(join(folder, entry.name)) } catch {} } }; empties(parent); mkdirSync(id, { recursive: true, mode: 0o700 }); empties(id); const real = (path) => { try { return realpathSync.native(path) } catch { return resolve(path) } }; const inside = real(id) + sep; const now = Date.now(); const stale = []; for (let i = 0; i < pairs.length; i += 2) { const lock = /^lock:skraft-replay (\\d+)$/.exec(pairs[i + 1]); if (real(pairs[i]).startsWith(inside) && (pairs[i + 1] === '-' || (lock !== null && now - Number(lock[1]) > 21600000))) stale.push(pairs[i]) } proc.stdout.write(JSON.stringify({ path: mkdtempSync(join(id, sha.slice(0, 7) + '-')), lock: 'skraft-replay ' + now, stale }))"

/** Sweep, add the worktree, then run the program in it. @param {CommandRunner} commandRunner @param {Replay} replay @param {ReplayFolder} folder */
const replayInWorktree = async (commandRunner, replay, folder) => {
  const installed = await installedDependencies(commandRunner, replay.repository)
  for (const path of folder.stale) await removeWorktree(commandRunner, replay.repository, { path, installed })
  const worktree = { path: folder.path, installed }
  const added = await git(commandRunner, replay.repository, ['worktree', 'add', '--detach', '--lock', '--reason', folder.lock, worktree.path, replay.sha])
  if (!succeeded(added)) return notCheckedOut(replay, 'Git could not add a worktree for it')
  return runThenRemoveWorktree(commandRunner, replay, worktree)
}

/**
 * The dependency folders the working copy installed in the repository, relative to its top:
 * Git lists each ignored folder once, the folders inside it left out.
 * @param {CommandRunner} commandRunner @param {string} repository @returns {Promise<string[]>}
 */
const installedDependencies = async (commandRunner, repository) => {
  const listed = await git(commandRunner, repository, ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'])
  return listed.stdout.split('\0').map((entry) => entry.replace(/\/$/, '')).filter((folder) => DEPENDENCY_FOLDERS.includes(/** @type {string} */ (folder.split('/').at(-1))))
}

/**
 * The worktree goes even when the program fails; a program that would miss the installed
 * dependencies does not start.
 * @param {CommandRunner} commandRunner @param {Replay} replay @param {LinkedWorktree} worktree
 */
const runThenRemoveWorktree = async (commandRunner, replay, worktree) => {
  try {
    if (!(await dependencyLinks(commandRunner, 'link', replay.repository, worktree))) return notCheckedOut(replay, 'the dependencies installed in the working copy could not be linked')
    return await runFirst(commandRunner, replay, `${worktree.path}/${replay.cwd}`)
  } finally {
    await removeWorktree(commandRunner, replay.repository, worktree)
  }
}

/**
 * The first choice that starts, in the one checkout; none starting is said in fixed words.
 * @param {CommandRunner} commandRunner @param {Pick<Replay, 'choices' | 'importRoots'>} replay @param {string} cwd absolute
 * @returns {Promise<CommandResult>}
 */
const runFirst = async (commandRunner, { choices, importRoots }, cwd) => {
  for (const argv of choices) {
    const answer = await commandRunner.run({ argv: launched(argv, importRoots), cwd })
    if (answer.started && answer.exitCode !== NOT_STARTED) return answer
  }
  return { started: false, exitCode: null, stdout: '', stderr: '', error: `could not start ${choices.map(([program]) => program).join(' nor ')}` }
}

/** What the launcher exits with when its program cannot start, as a shell does. */
const NOT_STARTED = 127

/**
 * The argv as written, or, with import roots, the launcher that starts it with them first on
 * PYTHONPATH: the Claude Code mod's `$.process.run` passes no environment.
 * @param {string[]} argv @param {string[]} importRoots
 */
const launched = (argv, importRoots) => (importRoots.length === 0 ? argv : ['node', '-e', LAUNCH, '--', String(importRoots.length), ...importRoots, ...argv])

/**
 * Starts its program, after the count and the import roots, with those roots resolved from its
 * folder before the PYTHONPATH it was given, and exits as the program does; 127 when it cannot
 * start it. One line, no double quote: a `node` that is a cmd.exe shim cuts at a line feed.
 */
const LAUNCH = "const { spawnSync } = module.require('node:child_process'); const { delimiter, resolve } = module.require('node:path'); const [count, ...rest] = globalThis.process.argv.slice(1); const roots = rest.slice(0, Number(count)).map((root) => resolve(root)); const [program, ...args] = rest.slice(Number(count)); const env = { ...globalThis.process.env, PYTHONPATH: [...roots, globalThis.process.env.PYTHONPATH].filter(Boolean).join(delimiter) }; const run = spawnSync(program, args, { stdio: 'inherit', env }); if (run.error) globalThis.process.exit(127); if (run.signal) globalThis.process.kill(globalThis.process.pid, run.signal); globalThis.process.exit(run.status)"

/**
 * Its links go before Git removes the worktree, so that Git never meets one; a worktree whose
 * links could not all be removed stays. Git removes a locked worktree only when forced twice.
 * @param {CommandRunner} commandRunner @param {string} repository @param {LinkedWorktree} worktree
 */
const removeWorktree = async (commandRunner, repository, worktree) => {
  if (!(await dependencyLinks(commandRunner, 'unlink', repository, worktree))) return
  await git(commandRunner, repository, ['worktree', 'remove', '--force', '--force', worktree.path])
  await git(commandRunner, repository, ['worktree', 'prune'])
}

/**
 * Node links each installed folder of the repository into the worktree, or unlinks it, from the
 * working copy; nothing runs when the working copy installed none.
 * @param {CommandRunner} commandRunner @param {'link' | 'unlink'} verb @param {string} repository @param {LinkedWorktree} worktree
 * @returns {Promise<boolean>} whether every folder is linked, or unlinked
 */
const dependencyLinks = async (commandRunner, verb, repository, { path, installed }) =>
  installed.length === 0 || succeeded(await node(commandRunner, LINKS, [verb, repository, path, ...installed]))

/**
 * Links (`link`) or unlinks (`unlink`) each folder of its arguments, relative to the repository
 * and to the worktree. A link is a symbolic link, a junction on Windows, which needs no
 * privilege; it is made only where the commit holds the folder's parent and nothing at its
 * place, and only a link is ever removed, never a folder. One line, like the others.
 */
const LINKS = "const { lstatSync, symlinkSync, unlinkSync } = module.require('node:fs'); const { dirname, resolve } = module.require('node:path'); const [verb, repository, worktree, ...folders] = globalThis.process.argv.slice(1); const present = (path) => lstatSync(path, { throwIfNoEntry: false }) !== undefined; for (const folder of folders) { const path = resolve(worktree, folder); if (verb === 'link' && present(dirname(path)) && !present(path)) symlinkSync(resolve(repository, folder), path, 'junction'); if (verb === 'unlink' && present(path) && lstatSync(path).isSymbolicLink()) unlinkSync(path) }"

/**
 * One of these scripts in a child Node, from the working copy, within its time limit: its
 * globals are reached through `module` and `globalThis`, never in the module that loads this file.
 * @param {CommandRunner} commandRunner @param {string} script @param {string[]} args
 */
// Stryker disable next-line StringLiteral: '.' and '' both name the working copy to either runner
const node = (commandRunner, script, args) => commandRunner.run({ argv: ['node', '-e', script, '--', ...args], cwd: '.', timeoutMs: STEP_TIMEOUT_MS })

/** @param {CommandRunner} commandRunner @param {string} cwd @param {string[]} args */
const git = (commandRunner, cwd, args) => commandRunner.run({ argv: ['git', '-c', 'core.quotepath=off', ...args], cwd, timeoutMs: STEP_TIMEOUT_MS })

/** @param {CommandResult} result */
const succeeded = (result) => result.started && result.exitCode === 0

/** Why the commit is not checked out, in fixed words: never Git's own text. @param {Pick<Replay, 'repository' | 'sha'>} replay @param {string} why @returns {CommandResult} */
// Stryker disable next-line StringLiteral: a program that never started has no output anyone reads
const notCheckedOut = ({ repository, sha }, why) => ({ started: false, exitCode: null, stdout: '', stderr: '', error: `could not check out ${sha} in ${repository}: ${why}` })
