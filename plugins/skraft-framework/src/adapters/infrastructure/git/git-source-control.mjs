// SourceControl (ports/infrastructure/source-control.mjs) on any git runner:
// git(args) => Promise<string | null>, stdout or null on failure. Node hosts run git with
// child_process (node-git-runner.mjs), the Claude Code mod with $.process.run. Every
// revision is validated as a hex SHA before it reaches git, so a log can never smuggle an
// option into the command line. No Node API here.
const SHA = /^[0-9a-f]{7,64}$/i
const lines = (text) => (text ?? '').split('\n').filter(Boolean)
const isSha = (sha) => SHA.test(sha ?? '')

export const createGitSourceControl = ({ git }) => {
  const head = async () => (await git(['rev-parse', 'HEAD']))?.trim() || null
  const filesOf = async (sha) => (isSha(sha) ? lines(await git(['diff-tree', '--no-commit-id', '--name-only', '-r', '--root', sha])) : [])
  return Object.freeze({
    head,
    headSha: head,
    parentOf: async (sha) => (isSha(sha) ? (await git(['rev-parse', '--verify', '--quiet', `${sha}^`]))?.trim() || null : null),
    filesOf,
    commit: async (sha) => {
      if (!isSha(sha) || (await git(['cat-file', '-e', `${sha}^{commit}`])) === null) return { exists: false }
      return {
        exists: true,
        subject: (await git(['log', '-1', '--format=%s', sha]))?.trim() ?? '',
        message: (await git(['log', '-1', '--format=%B', sha])) ?? '',
        files: await filesOf(sha),
      }
    },
    range: async (base, rev) => (isSha(base) && isSha(rev) ? lines(await git(['rev-list', '--no-merges', `${base}..${rev}`])) : []),
    diff: async (base, rev) => (isSha(base) && isSha(rev) ? git(['diff', `${base}..${rev}`]) : null),
    changedFiles: async (base, rev) => (isSha(base) && isSha(rev) ? git(['diff', '--name-status', `${base}..${rev}`]) : null),
    show: async (sha, path) => (isSha(sha) && typeof path === 'string' && path.length > 0 ? git(['show', `${sha}:${path}`]) : null),
    currentBranch: async () => (await git(['symbolic-ref', '--quiet', '--short', 'HEAD']))?.trim() || null,
    remoteUrl: async () => (await git(['remote', 'get-url', 'origin']))?.trim() || null,
    listRecent: async (count) => lines(await git(['log', '-n', String(count), '--pretty=format:%H%x1f%s']))
      .map((line) => {
        const [sha, subject] = line.split('\x1f')
        return { sha, subject: subject ?? '' }
      }),
  })
}
