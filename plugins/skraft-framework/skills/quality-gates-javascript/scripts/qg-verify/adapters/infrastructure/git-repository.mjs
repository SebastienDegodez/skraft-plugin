import { execFileSync } from 'node:child_process'

// Read-only Git facts for evidence verification. Every call is fail-soft (null or empty)
// and every revision is validated as a hex SHA before it reaches git, so a log can never
// smuggle an option into the command line.
const SHA = /^[0-9a-f]{7,64}$/i

export const createGitRepository = ({ cwd }) => {
  const git = (args) => {
    try {
      return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024 })
    } catch {
      return null
    }
  }
  const lines = (text) => (text ?? '').split('\n').filter(Boolean)
  const filesOf = (sha) => (SHA.test(sha ?? '') ? lines(git(['diff-tree', '--no-commit-id', '--name-only', '-r', '--root', sha])) : [])

  return {
    head: () => git(['rev-parse', 'HEAD'])?.trim() || null,
    parentOf: (sha) => (SHA.test(sha ?? '') ? git(['rev-parse', '--verify', '--quiet', `${sha}^`])?.trim() || null : null),
    filesOf,
    commit: (sha) => {
      if (!SHA.test(sha ?? '') || git(['cat-file', '-e', `${sha}^{commit}`]) === null) return { exists: false }
      return {
        exists: true,
        subject: git(['log', '-1', '--format=%s', sha])?.trim() ?? '',
        message: git(['log', '-1', '--format=%B', sha]) ?? '',
        files: filesOf(sha),
      }
    },
    range: (base, rev) => (SHA.test(base ?? '') && SHA.test(rev ?? '') ? lines(git(['rev-list', '--no-merges', `${base}..${rev}`])) : []),
    show: (sha, path) => (SHA.test(sha ?? '') && typeof path === 'string' && path.length > 0 ? git(['show', `${sha}:${path}`]) : null),
  }
}
