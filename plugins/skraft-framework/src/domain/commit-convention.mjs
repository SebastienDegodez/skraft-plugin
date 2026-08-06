// Pure predicate for the conventional-commit subject format skraft's TDD workflow
// requires (G8): `type(scope): subject`. Same type set as the quality-gates-lens
// falsification rule (plugins/skraft-framework/agents/reviewer-lenses/quality-gates-lens.agent.md).
const CONVENTIONAL_COMMIT_RE = /^(feat|fix|chore|refactor|test|docs|build|perf|style|ci)(\([^)]+\))?: .+$/

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
