// Artifact registry + validation for the `artifact` mini-command CLI.
//
// Each SKRAFT artifact type owns ONE entry here: its template path and the
// required / optional field schema. The CLI (scripts/artifact.mjs) resolves the
// type, validates the payload against this schema, and renders the template — so
// an agent emits ONLY the data (via a safe heredoc), never the template path and
// never the structural boilerplate.
//
// A required field is "missing" when its key is absent, null, or an empty string
// (empty arrays count as missing too). The CLI turns a non-empty `missing` list
// into a machine-readable error + exit code 2 so the calling agent self-corrects.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render } from './render.mjs'

/** Absolute path to the repository root, derived from this file's location. */
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))

/** Registry of artifact types. Add a type by declaring its template + schema. */
export const ARTIFACTS = {
  adr: {
    template: 'plugins/skraft-framework/agents/assets/templates/adr.template.md',
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
    template: 'plugins/skraft-framework/agents/assets/templates/review-verdict.template.md',
    required: [
      'phase',
      'projectSlug',
      'date',
      'attempt',
      'verdict',
      'lensCount',
      'score',
      'lenses',
      'synthesis',
      'conclusion',
    ],
    optional: [],
  },
  'review-comment': {
    template: 'plugins/skraft-framework/agents/assets/templates/review-comment.template.md',
    required: ['phase', 'icon', 'status', 'artefacts', 'verdictLabel', 'nextPhase'],
    optional: ['difficulty', 'evidence', 'evidenceLinks'],
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

/**
 * Render artifact `type` from validated `data`. Assumes validation passed; reads
 * the template relative to `root` and renders it. Throws on read/render error.
 */
export function renderArtifact(type, data, { root = REPO_ROOT } = {}) {
  const spec = ARTIFACTS[type]
  if (!spec) throw new Error(`unknown artifact type: ${type}`)
  const template = readFileSync(resolve(root, spec.template), 'utf8')
  return render(template, data)
}
