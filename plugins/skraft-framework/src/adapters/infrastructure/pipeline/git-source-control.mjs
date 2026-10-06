import { createGitRepository } from '../git-repository.mjs'

// SourceControl (ports/infrastructure/source-control.mjs) on the existing git adapter.
export const createGitSourceControl = ({ cwd }) => {
  const git = createGitRepository({ cwd })
  return Object.freeze({ headSha: async () => git.head() })
}
