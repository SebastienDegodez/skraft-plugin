import { joinRelative, normalizeRelative } from '../../domain/config/relative-path.mjs'

/**
 * @typedef {import('../../application/ports/command-runner.mjs').CommandRunner} CommandRunner
 * @typedef {import('../../application/ports/command-runner.mjs').CommandResult} CommandResult
 * @typedef {import('../../application/ports/commit-replay.mjs').ReplayRequest} Replay
 * @typedef {{ fromRepository: string, fromWorkingCopy: string }} ReplayWorktree
 *   the worktree as git sees it from the repository, and as the runner sees it from the working copy
 * @typedef {ReplayWorktree & { installed: string[] }} LinkedWorktree
 *   installed: the dependency folders the working copy installed, relative to the repository top
 */

/** The folders dependencies are installed into, which Git ignores and a checkout lacks: npm's, and Python's virtual environment. */
const DEPENDENCY_FOLDERS = Object.freeze(['node_modules', '.venv'])

/**
 * CommitReplay on `git worktree`, through any host's CommandRunner: a detached throwaway
 * worktree under the repository's git common dir (`<common dir>/skraft-replay/<sha>`), removed
 * once the program ends. The dependency folders the working copy installed are linked into it,
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
  return replayInWorktree(commandRunner, replay, replayWorktree(repository, common.stdout.trim(), sha))
}

/** @param {string} repository @param {string} commonDir @param {string} sha @returns {ReplayWorktree} */
const replayWorktree = (repository, commonDir, sha) => {
  if (isAbsolute(commonDir)) {
    const path = underAbsolute(commonDir, 'skraft-replay', sha)
    return { fromRepository: path, fromWorkingCopy: path }
  }
  return { fromRepository: joinRelative(commonDir, 'skraft-replay', sha), fromWorkingCopy: joinRelative(repository, commonDir, 'skraft-replay', sha) }
}

/** Add the worktree, then run the program in it. @param {CommandRunner} commandRunner @param {Replay} replay @param {ReplayWorktree} worktree */
const replayInWorktree = async (commandRunner, replay, worktree) => {
  const linked = { ...worktree, installed: await installedDependencies(commandRunner, replay.repository) }
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
  return git(commandRunner, repository, ['worktree', 'add', '--detach', '--force', worktree.fromRepository, sha])
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
    return await commandRunner.run({ argv: replay.argv, cwd: under(worktree.fromWorkingCopy, replay.cwd) })
  } finally {
    await removeWorktree(commandRunner, replay.repository, worktree)
  }
}

/** Its links go before Git removes the worktree, so that Git never meets one. @param {CommandRunner} commandRunner @param {string} repository @param {LinkedWorktree} worktree */
const removeWorktree = async (commandRunner, repository, worktree) => {
  await dependencyLinks(commandRunner, 'unlink', repository, worktree)
  await git(commandRunner, repository, ['worktree', 'remove', '--force', worktree.fromRepository])
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
const dependencyLinks = async (commandRunner, verb, repository, { fromWorkingCopy, installed }) => {
  if (installed.length === 0) return NOTHING_TO_DO
  return commandRunner.run({ argv: ['node', '-e', LINKS, '--', verb, repository, fromWorkingCopy, ...installed], cwd: '.' })
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

/** `/x`, `\x`, `\\server\x`, `C:\x`, `C:/x`. @param {string} path */
const isAbsolute = (path) => /^(?:[\\/]|[A-Za-z]:[\\/])/.test(path)

/** @param {string} base @param {string} relative `/`-separated */
const under = (base, relative) => (isAbsolute(base) ? underAbsolute(base, relative) : joinRelative(base, relative))

/** @param {string} base absolute @param {...string} parts relative, `/`-separated */
const underAbsolute = (base, ...parts) => {
  const tail = normalizeRelative(parts.join('/'))
  return tail === '.' ? base : `${base.replace(/[\\/]+$/, '')}/${tail}`
}
