/**
 * @typedef {import('../../application/ports/command-runner.mjs').CommandRunner} CommandRunner
 * @typedef {import('../../application/ports/command-runner.mjs').CommandResult} CommandResult
 * @typedef {import('../../application/ports/commit-replay.mjs').ReplayRequest} Replay
 * @typedef {{ path: string, installed: string[] }} LinkedWorktree
 *   path: the worktree, absolute; installed: the dependency folders the working copy installed,
 *   relative to the repository top
 */

/** The folders dependencies are installed into, which Git ignores and a checkout lacks: npm's, and Python's virtual environment. */
const DEPENDENCY_FOLDERS = Object.freeze(['node_modules', '.venv'])

/**
 * CommitReplay on `git worktree`, through any host's CommandRunner: a detached throwaway
 * worktree in the temporary folder, outside the repository and its git dir, where tools that skip
 * folders named `.git` (Vite) see its files: `<tmp>/skraft-replay/<repository id>/<sha>`,
 * the id hashed from the git common dir; it is removed once the program ends. The dependency folders the working copy installed are linked into it,
 * at the same places, and unlinked before Git removes it. No Node API here.
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
  if (!succeeded(common)) return notCheckedOut(replay, failure(common))
  const folder = await commandRunner.run({ argv: ['node', '-e', REPLAY_FOLDER, '--', repository, common.stdout.trim(), sha], cwd: '.' })
  if (!succeeded(folder)) return notCheckedOut(replay, 'no folder outside the repository to check it out in')
  return replayInWorktree(commandRunner, replay, folder.stdout)
}

/**
 * Prints where a commit of a repository is checked out: `<tmp>/skraft-replay/<id>/<sha>`, the
 * id the first 12 hex of the SHA-256 of the git common dir's path, so that two clones never
 * share a folder. It runs in a child Node, never in the module that loads this file.
 */
const REPLAY_FOLDER = [
  "const { createHash } = module.require('node:crypto')",
  "const { tmpdir } = module.require('node:os')",
  "const { join, resolve } = module.require('node:path')",
  'const [repository, commonDir, sha] = globalThis.process.argv.slice(1)',
  "const id = createHash('sha256').update(resolve(repository, commonDir)).digest('hex').slice(0, 12)",
  "globalThis.process.stdout.write(join(tmpdir(), 'skraft-replay', id, sha))",
].join('\n')

/** Add the worktree, then run the program in it. @param {CommandRunner} commandRunner @param {Replay} replay @param {string} path absolute */
const replayInWorktree = async (commandRunner, replay, path) => {
  const linked = { path, installed: await installedDependencies(commandRunner, replay.repository) }
  const added = await addWorktree(commandRunner, replay, linked)
  if (!succeeded(added)) return notCheckedOut(replay, failure(added))
  return runThenRemoveWorktree(commandRunner, replay, linked)
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

/** A leftover worktree of an earlier replay goes first. @param {CommandRunner} commandRunner @param {Replay} replay @param {LinkedWorktree} worktree */
const addWorktree = async (commandRunner, { repository, sha }, worktree) => {
  await removeWorktree(commandRunner, repository, worktree)
  return git(commandRunner, repository, ['worktree', 'add', '--detach', '--force', worktree.path, sha])
}

/**
 * The worktree goes even when the program fails; a program that would miss the installed
 * dependencies does not start.
 * @param {CommandRunner} commandRunner @param {Replay} replay @param {LinkedWorktree} worktree
 */
const runThenRemoveWorktree = async (commandRunner, replay, worktree) => {
  try {
    const linked = await dependencyLinks(commandRunner, 'link', replay.repository, worktree)
    if (!succeeded(linked)) return notCheckedOut(replay, 'the dependencies installed in the working copy could not be linked')
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
 * start it. One line, no quote: a `node` that is a cmd.exe shim cuts at a line feed.
 */
const LAUNCH = "const { spawnSync } = module.require('node:child_process'); const { delimiter, resolve } = module.require('node:path'); const [count, ...rest] = globalThis.process.argv.slice(1); const roots = rest.slice(0, Number(count)).map((root) => resolve(root)); const [program, ...args] = rest.slice(Number(count)); const env = { ...globalThis.process.env, PYTHONPATH: [...roots, globalThis.process.env.PYTHONPATH].filter(Boolean).join(delimiter) }; const run = spawnSync(program, args, { stdio: 'inherit', env }); if (run.error) globalThis.process.exit(127); if (run.signal) globalThis.process.kill(globalThis.process.pid, run.signal); globalThis.process.exit(run.status)"

/** Its links go before Git removes the worktree, so that Git never meets one. @param {CommandRunner} commandRunner @param {string} repository @param {LinkedWorktree} worktree */
const removeWorktree = async (commandRunner, repository, worktree) => {
  await dependencyLinks(commandRunner, 'unlink', repository, worktree)
  await git(commandRunner, repository, ['worktree', 'remove', '--force', worktree.path])
  await git(commandRunner, repository, ['worktree', 'prune'])
}

/** What a step with nothing to do answers. @type {CommandResult} */
const NOTHING_TO_DO = Object.freeze({ started: true, exitCode: 0, stdout: '', stderr: '' })

/**
 * Node links each installed folder of the repository into the worktree, or unlinks it, from the
 * working copy; nothing runs when the working copy installed none.
 * @param {CommandRunner} commandRunner @param {'link' | 'unlink'} verb @param {string} repository @param {LinkedWorktree} worktree
 * @returns {Promise<CommandResult>}
 */
const dependencyLinks = async (commandRunner, verb, repository, { path, installed }) => {
  if (installed.length === 0) return NOTHING_TO_DO
  return commandRunner.run({ argv: ['node', '-e', LINKS, '--', verb, repository, path, ...installed], cwd: '.' })
}

/**
 * Links (`link`) or unlinks (`unlink`) each folder of its arguments, relative to the repository
 * and to the worktree. A link is a symbolic link, a junction on Windows, which needs no
 * privilege; it is made only where the commit holds the folder's parent and nothing at its
 * place, and only a link is ever removed, never a folder. It runs in a child Node, never in the
 * module that loads this file: its globals are reached through `module` and `globalThis`.
 */
const LINKS = [
  "const { lstatSync, symlinkSync, unlinkSync } = module.require('node:fs')",
  "const { dirname, resolve } = module.require('node:path')",
  'const [verb, repository, worktree, ...folders] = globalThis.process.argv.slice(1)',
  'const present = (path) => lstatSync(path, { throwIfNoEntry: false }) !== undefined',
  'for (const folder of folders) {',
  '  const path = resolve(worktree, folder)',
  '  if (verb === "link" && present(dirname(path)) && !present(path)) symlinkSync(resolve(repository, folder), path, "junction")',
  '  if (verb === "unlink" && present(path) && lstatSync(path).isSymbolicLink()) unlinkSync(path)',
  '}',
].join('\n')

/** @param {CommandRunner} commandRunner @param {string} cwd @param {string[]} args */
const git = (commandRunner, cwd, args) => commandRunner.run({ argv: ['git', '-c', 'core.quotepath=off', ...args], cwd })

/** @param {CommandResult} result */
const succeeded = (result) => result.started && result.exitCode === 0

/** @param {Replay} replay @param {string} why @returns {CommandResult} */
const notCheckedOut = ({ repository, sha }, why) => ({ started: false, exitCode: null, stdout: '', stderr: '', error: `could not check out ${sha} in ${repository}: ${why}` })

/** @param {CommandResult} result */
const failure = (result) => (result.error ?? result.stderr).trim()
