import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// Real git-backed CommitVerifier (G5). Verifies the working tree has no uncommitted
// changes — i.e. any work the DELIVER specialist claims to have done was actually
// committed, not just asserted. Any git failure (not a repo, git missing, ...) is
// treated as unverified: the caller decides whether that fails closed.
export const createGitCommitVerifier = ({ cwd } = {}) => ({
  verify: async () => {
    try {
      const { stdout: status } = await execFileAsync('git', ['status', '--porcelain'], { cwd })
      const { stdout: sha } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd })
      return { clean: status.trim().length === 0, headSha: sha.trim() }
    } catch {
      return { clean: false, headSha: null }
    }
  }
})
