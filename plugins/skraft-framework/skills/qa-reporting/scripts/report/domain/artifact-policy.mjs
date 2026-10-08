// Pure domain: artefact path patterns and review-file verdicts, shared by the phase
// closure gate (phase-gate-policy.mjs). No IO.

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
