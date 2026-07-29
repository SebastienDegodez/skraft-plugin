// Artifact registry + validation for the `artifact` mini-command CLI
// (plugins/src/cli/artifact.mjs).
//
// Each SKRAFT artifact type owns ONE entry here: its template path (relative to
// the plugin root, i.e. this repo's `plugins/` directory) and the required /
// optional field schema. The CLI resolves the type, validates the payload
// against this schema, and renders the template — so an agent emits ONLY the
// data (via a safe heredoc), never the template path and never the structural
// boilerplate.
//
// A required field is "missing" when its key is absent, null, or an empty string
// (empty arrays count as missing too). The CLI turns a non-empty `missing` list
// into a machine-readable error + exit code 2 so the calling agent self-corrects.

/** Registry of artifact types. Add a type by declaring its template + schema. */
export const ARTIFACTS = {
  adr: {
    template: 'agents/assets/templates/adr.template.md',
    required: [
      'adr',
      'adrLabel',
      'title',
      'status',
      'chosen',
      'decisionSummary',
      'date',
      'deciders',
      'context',
      'decision',
      'consequences',
    ],
    optional: ['ratifiedBy', 'supersedes', 'supersedesLink', 'alternatives'],
  },
  'review-verdict': {
    template: 'agents/assets/templates/review-verdict.template.md',
    required: [
      'phase',
      'projectSlug',
      'date',
      'attempt',
      'verdict',
      'depthTier',
      'lensCount',
      'score',
      'lenses',
      'synthesis',
      'conclusion',
    ],
    optional: [],
  },
  'review-comment': {
    template: 'agents/assets/templates/review-comment.template.md',
    required: ['phase', 'icon', 'status', 'artefacts', 'verdictLabel', 'nextPhase'],
    optional: ['difficulty', 'depthTier', 'evidence', 'evidenceLinks'],
  },
}

/** True when a required field carries no usable value. */
function isMissing(value) {
  if (value == null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

/**
 * Validate `data` against the schema of artifact `type`.
 * Returns { ok, type, missing, unknownType }. Never throws for a bad type — the
 * caller decides how to surface it.
 */
export function validate(type, data) {
  const spec = ARTIFACTS[type]
  if (!spec) return { ok: false, type, unknownType: true, missing: [] }
  const missing = spec.required.filter((key) => isMissing(data ? data[key] : undefined))
  return { ok: missing.length === 0, type, unknownType: false, missing }
}
