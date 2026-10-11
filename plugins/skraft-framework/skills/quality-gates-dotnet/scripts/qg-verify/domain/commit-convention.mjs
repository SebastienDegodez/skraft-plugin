// Pure subject-only audit: type(feature-scope): subject, with optional breaking !.
const CONVENTIONAL_COMMIT_RE = /^(feat|fix|chore|refactor|test|docs|build|perf|style|ci)\([a-z][a-z0-9]*(?:-[a-z0-9]+)*\)!?: \S[^\r\n]*$/

export const isConventionalCommitSubject = (subject) =>
  typeof subject === 'string' && CONVENTIONAL_COMMIT_RE.test(subject)

// Flags commits whose subject does not match `type(scope): subject`, so a manual
// DELIVER closure can catch stray auto-commit-hook messages (e.g. "Copilot CLI
// session ... changes") before they land in history unfixed.
export const scanCommitConvention = (commits) =>
  (commits ?? []).map((commit) => ({
    ...commit,
    conventional: isConventionalCommitSubject(commit.subject),
  }))
