import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// Real git-backed CommitLogReader. Any git failure (not a repo, git missing, no
// commits yet, ...) is treated as an empty history rather than throwing, so callers
// can scan freely without special-casing a brand-new repository.
export const createGitCommitLogReader = ({ cwd } = {}) => ({
  listRecent: async (count) => {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['log', `-n`, String(count), '--pretty=format:%H%x1f%s'],
        { cwd }
      )
      return stdout
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => {
          const [sha, subject] = line.split('\x1f')
          return { sha, subject: subject ?? '' }
        })
    } catch {
      return []
    }
  }
})
