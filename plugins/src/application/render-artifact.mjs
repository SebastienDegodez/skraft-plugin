// Renders a SKRAFT artifact from validated data — the use case behind the
// `artifact` mini-command CLI (plugins/src/cli/artifact.mjs).
//
// Keeps IO (reading the template file) behind a `readTemplate` port so the
// rendering logic itself stays a pure composition of domain functions.
import { ARTIFACTS, validate } from '../domain/artifact-registry.mjs'
import { render } from '../domain/template-renderer.mjs'

/**
 * Render artifact `type` from validated `data`. Assumes validation passed.
 * @param {string} type
 * @param {object} data
 * @param {{ readTemplate: (templatePath: string) => string }} deps
 * @returns {string}
 */
export function renderArtifact(type, data, { readTemplate }) {
  const spec = ARTIFACTS[type]
  if (!spec) throw new Error(`unknown artifact type: ${type}`)
  return render(readTemplate(spec.template), data)
}

export { ARTIFACTS, validate }
