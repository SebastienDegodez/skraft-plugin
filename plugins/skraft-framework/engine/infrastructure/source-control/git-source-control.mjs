import { joinRelative } from '../../domain/config/relative-path.mjs'

/**
 * SourceControl on the `git` command, through any host's CommandRunner: Node's processes or
 * the Claude Code mod's `$.process.run`. No Node API here.
 * @param {{ commandRunner: import('../../application/ports/command-runner.mjs').CommandRunner }} options
 * @returns {import('../../application/ports/source-control.mjs').SourceControl}
 */
export const createGitSourceControl = ({ commandRunner }) => {
  /** @param {string} dir @param {string[]} args @returns {Promise<string | null>} stdout, null when git failed */
  const git = async (dir, args) => {
    const result = await commandRunner.run({ argv: ['git', '-c', 'core.quotepath=off', ...args], cwd: dir })
    return result.started && result.exitCode === 0 ? result.stdout : null
  }
  const lines = (/** @type {string} */ text) => text.split(/\r?\n/).filter((line) => line !== '')
  return Object.freeze({
    unavailable: async () => {
      const result = await commandRunner.run({ argv: ['git', '--version'], cwd: '.' })
      return result.started ? null : /** @type {string} */ (result.error)
    },
    repository: async (dir) => {
      const cdup = await git(dir, ['rev-parse', '--show-cdup'])
      return cdup === null ? null : joinRelative(dir, cdup.trim())
    },
    mergeBase: async (dir, ref) => {
      const sha = await git(dir, ['merge-base', '--end-of-options', 'HEAD', ref])
      return sha?.trim() ?? null
    },
    changedFiles: async (dir, sha) => {
      const changed = await git(dir, ['diff', '--name-only', '--relative', '--end-of-options', sha, '--'])
      const untracked = await git(dir, ['ls-files', '--others', '--exclude-standard'])
      if (changed === null) return null
      return [...new Set([...lines(changed), ...lines(untracked ?? '')])]
    },
  })
}
