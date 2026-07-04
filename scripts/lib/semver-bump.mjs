// Pure: Conventional Commits -> semver bump. No IO.
// Consumed by scripts/release-version.mjs (release workflow) — the repo-side
// half of the auto-update chain.

const BREAKING_RE = /^[a-z]+(\([^)]*\))?!:|(^|\n)BREAKING CHANGE:/
const MINOR_RE = /^feat(\([^)]*\))?:/
const PATCH_RE = /^(fix|perf|refactor)(\([^)]*\))?:/

// Highest bump across all commit messages; null when nothing is releasable.
export const bumpFromCommits = (messages = []) => {
  let bump = null
  for (const message of messages) {
    if (BREAKING_RE.test(message)) return 'major'
    if (MINOR_RE.test(message)) bump = 'minor'
    else if (PATCH_RE.test(message) && bump === null) bump = 'patch'
  }
  return bump
}

export const nextVersion = (current, bump) => {
  if (bump === null) return null
  const [major, minor, patch] = String(current).replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10) || 0)
  if (bump === 'major') return `${major + 1}.0.0`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}
