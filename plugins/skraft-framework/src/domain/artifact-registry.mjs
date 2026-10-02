// Artifact registry + validation for the `artifact` mini-command CLI
// (plugins/skraft-framework/src/cli/artifact.mjs).
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
    template: 'assets/templates/adr.template.md',
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
    template: 'assets/templates/review-verdict.template.md',
    requiredAny: [
      ['verdict', 'status'],
      ['lenses', 'lens_results'],
      ['synthesis', 'summary'],
    ],
    // The phase gate reads the verdict with a case-sensitive pattern, so a
    // lower-case `rejected` would leave the phase with no readable verdict.
    enums: {
      verdict: ['APPROVED', 'NEEDS_REWORK', 'REJECTED'],
      status: ['APPROVED', 'NEEDS_REWORK', 'REJECTED'],
    },
    optional: [
      'confidence', 'reviewed_at', 'artefacts_reviewed', 'dissent_analysis',
      'reviewed_sha', 'carried_forward', 'escalation',
    ],
  },
  'review-comment': {
    template: 'assets/templates/review-comment.template.md',
    required: ['phase', 'icon', 'status', 'artefacts', 'verdictLabel', 'nextPhase'],
    optional: ['evidence', 'evidenceLinks'],
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
 * Returns { ok, type, missing, invalid, unknownType }. Never throws for a bad
 * type — the caller decides how to surface it. `invalid` lists the present enum
 * fields whose value is not one of the allowed values.
 */
export function validate(type, data) {
  const spec = ARTIFACTS[type]
  if (!spec) return { ok: false, type, unknownType: true, missing: [], invalid: [] }
  const missing = [
    ...(spec.required ?? []).filter((key) => isMissing(data ? data[key] : undefined)),
    ...(spec.requiredAny ?? [])
      .filter((keys) => keys.every((key) => isMissing(data ? data[key] : undefined)))
      .map((keys) => keys.join('|')),
  ]
  const invalid = Object.entries(spec.enums ?? {})
    .filter(([key, allowed]) => !isMissing(data?.[key]) && !allowed.includes(data[key]))
    .map(([key, allowed]) => ({ field: key, value: data[key], allowed }))
  return { ok: missing.length === 0 && invalid.length === 0, type, unknownType: false, missing, invalid }
}

const canonicalToken = (value) => String(value).trim().toUpperCase().replace(/[\s-]+/g, '_')

/**
 * Return a copy of `data` whose enum fields carry their canonical spelling when
 * they differ only by case, spaces or hyphens (`needs rework` → `NEEDS_REWORK`).
 * Values that match no allowed value are left as-is for `validate` to report.
 */
export function normalize(type, data) {
  const spec = ARTIFACTS[type]
  if (!spec?.enums || !data || typeof data !== 'object') return data
  const normalized = { ...data }
  for (const [key, allowed] of Object.entries(spec.enums)) {
    if (typeof normalized[key] !== 'string') continue
    const match = allowed.find((value) => value === canonicalToken(normalized[key]))
    if (match) normalized[key] = match
  }
  return normalized
}
