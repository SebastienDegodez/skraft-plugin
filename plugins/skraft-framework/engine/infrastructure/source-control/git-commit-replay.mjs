import { joinRelative, normalizeRelative } from '../../domain/config/relative-path.mjs'

/**
 * @typedef {import('../../application/ports/command-runner.mjs').CommandRunner} CommandRunner
 * @typedef {import('../../application/ports/command-runner.mjs').CommandResult} CommandResult
 * @typedef {import('../../application/ports/commit-replay.mjs').ReplayRequest} Replay
 * @typedef {{ fromRepository: string, fromWorkingCopy: string }} ReplayWorktree
 *   the worktree as git sees it from the repository, and as the runner sees it from the working copy
 */

/**
 * CommitReplay on `git worktree`, through any host's CommandRunner: a detached throwaway
 * worktree under the repository's git common dir (`<common dir>/skraft-replay/<sha>`), removed
 * once the program ends. No Node API here.
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
  const added = await addWorktree(commandRunner, replay, worktree.fromRepository)
  if (!succeeded(added)) return notCheckedOut(replay, failure(added))
  return runThenRemoveWorktree(commandRunner, replay, worktree)
}

/** A leftover worktree of an earlier replay goes first. @param {CommandRunner} commandRunner @param {Replay} replay @param {string} path */
const addWorktree = async (commandRunner, { repository, sha }, path) => {
  await removeWorktree(commandRunner, repository, path)
  return git(commandRunner, repository, ['worktree', 'add', '--detach', '--force', path, sha])
}

/** The worktree goes even when the program fails. @param {CommandRunner} commandRunner @param {Replay} replay @param {ReplayWorktree} worktree */
const runThenRemoveWorktree = async (commandRunner, { repository, cwd, argv }, worktree) => {
  try {
    return await commandRunner.run({ argv, cwd: under(worktree.fromWorkingCopy, cwd) })
  } finally {
    await removeWorktree(commandRunner, repository, worktree.fromRepository)
  }
}

/** @param {CommandRunner} commandRunner @param {string} repository @param {string} path */
const removeWorktree = async (commandRunner, repository, path) => {
  await git(commandRunner, repository, ['worktree', 'remove', '--force', path])
  await git(commandRunner, repository, ['worktree', 'prune'])
}

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
