import { joinRelative, normalizeRelative } from '../../domain/config/relative-path.mjs'

/**
 * CommitReplay on `git worktree`, through any host's CommandRunner: a detached throwaway
 * worktree under the repository's git common dir (`<common dir>/skraft-replay/<sha>`), removed
 * once the program ends. No Node API here.
 * @param {{ commandRunner: import('../../application/ports/command-runner.mjs').CommandRunner }} options
 * @returns {import('../../application/ports/commit-replay.mjs').CommitReplay}
 */
export const createGitCommitReplay = ({ commandRunner }) => {
  /** @param {string} cwd @param {string[]} args */
  const git = (cwd, args) => commandRunner.run({ argv: ['git', '-c', 'core.quotepath=off', ...args], cwd })
  return Object.freeze({
    run: async ({ repository, sha, cwd, argv }) => {
      /** @param {string} why */
      const notCheckedOut = (why) => ({ started: false, exitCode: null, stdout: '', stderr: '', error: `could not check out ${sha} in ${repository}: ${why}` })
      if (!/^[0-9a-f]{4,64}$/i.test(sha)) return notCheckedOut('not a commit sha')
      const common = await git(repository, ['rev-parse', '--git-common-dir'])
      if (!common.started || common.exitCode !== 0) return notCheckedOut(failure(common))
      const commonDir = common.stdout.trim()
      // The worktree as git sees it from the repository, and as the runner sees it from the working copy.
      const [fromRepository, fromWorkingCopy] = isAbsolute(commonDir)
        ? [underAbsolute(commonDir, 'skraft-replay', sha), underAbsolute(commonDir, 'skraft-replay', sha)]
        : [joinRelative(commonDir, 'skraft-replay', sha), joinRelative(repository, commonDir, 'skraft-replay', sha)]
      await git(repository, ['worktree', 'remove', '--force', fromRepository])
      await git(repository, ['worktree', 'prune'])
      const added = await git(repository, ['worktree', 'add', '--detach', '--force', fromRepository, sha])
      if (!added.started || added.exitCode !== 0) return notCheckedOut(failure(added))
      try {
        const start = isAbsolute(fromWorkingCopy) ? underAbsolute(fromWorkingCopy, cwd) : joinRelative(fromWorkingCopy, cwd)
        return await commandRunner.run({ argv, cwd: start })
      } finally {
        await git(repository, ['worktree', 'remove', '--force', fromRepository])
        await git(repository, ['worktree', 'prune'])
      }
    },
  })
}

/** @param {import('../../application/ports/command-runner.mjs').CommandResult} result */
const failure = (result) => (result.error ?? result.stderr).trim()

/** `/x`, `\x`, `\\server\x`, `C:\x`, `C:/x`. @param {string} path */
const isAbsolute = (path) => /^(?:[\\/]|[A-Za-z]:[\\/])/.test(path)

/** @param {string} base absolute @param {...string} parts relative, `/`-separated */
const underAbsolute = (base, ...parts) => {
  const tail = normalizeRelative(parts.join('/'))
  return tail === '.' ? base : `${base.replace(/[\\/]+$/, '')}/${tail}`
}
