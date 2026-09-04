// Pure domain: artifact + verdict completion policy (G4/G5). No IO.
// G4 = expected artifacts were actually produced. G5 = the recorded reviewer
// verdict matches what the reviewer actually wrote, and DELIVER carries a
// verified git commit. Together: never advance on a simple LLM assertion.

// Only patterns that look like a real file path (no whitespace) are checked
// against recorded artifacts — descriptive/non-file outputs (e.g. "Source code
// commits produced by software-engineer", "GitHub repository issues (via MCP tools)")
// are not files and cannot be verified on disk.
export const isFileArtifactPattern = (pattern) =>
  typeof pattern === 'string' && pattern.length > 0 && !/\s/.test(pattern)

// Returns the file-like output patterns config.agentArtifacts declares for agentName.
export const expectedArtifactsFor = (agentName, config) =>
  (config?.agentArtifacts?.[agentName]?.outputs ?? []).filter(isFileArtifactPattern)

// Converts a templated output pattern into a RegExp: "{placeholder}" segments and
// "*"/"**" globs become wildcards; every other character is matched literally.
export const artifactPatternToRegExp = (pattern) => {
  const escaped = pattern.replace(/[.+^$()|[\]\\]/g, '\\$&')
  const withGlobs = escaped
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
  const withPlaceholders = withGlobs.replace(/\{[^}]+\}/g, '[^/]+')
  return new RegExp(`^${withPlaceholders}$`)
}

// Returns the subset of expectedPatterns that have no matching entry in recordedPaths.
export const missingArtifacts = (expectedPatterns, recordedPaths = []) => {
  const paths = recordedPaths ?? []
  return expectedPatterns.filter((pattern) => {
    const re = artifactPatternToRegExp(pattern)
    return !paths.some((path) => re.test(path))
  })
}

// reviews/{date}/*.md files are rendered by review-verdict.template.md, which
// wraps the reviewer's payload in a fenced YAML block. The verdict is therefore
// a top-level `verdict:` (or its `status:` alias, see artifact-registry) whose
// value the renderer JSON-quotes. Anchored per line so the `status:` of a nested
// lens — always indented — can never be read as the verdict. Returns null when
// absent/unparseable.
const VERDICT_RE = /^(?:verdict|status):\s*"?(APPROVED|NEEDS_REWORK|REJECTED)"?\s*$/m

export const parseReviewVerdict = (content) => {
  if (typeof content !== 'string') return null
  const match = content.match(VERDICT_RE)
  return match ? match[1] : null
}

export const isApprovedVerdict = (verdict) => verdict === 'APPROVED'

// G5: DELIVER phase advancement additionally requires a verified git commit —
// the specialist's claimed work must be actually committed, not just asserted.
export const requiresVerifiedCommit = (phase) => phase === 'DELIVER'
