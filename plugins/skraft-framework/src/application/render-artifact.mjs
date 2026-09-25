// Renders a SKRAFT artifact from validated data — the use case behind the
// `artifact` mini-command CLI (plugins/skraft-framework/src/cli/artifact.mjs).
//
// Keeps IO (reading the template file) behind a `readTemplate` port so the
// rendering logic itself stays a pure composition of domain functions.
import { ARTIFACTS } from '../domain/artifact-registry.mjs'
import { render } from '../domain/template-renderer.mjs'

const quoteYaml = (value) => JSON.stringify(String(value))

const toYaml = (value, indent = 0) => {
  const pad = ' '.repeat(indent)
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]`
    return value.map((item) => {
      if (item !== null && typeof item === 'object') {
        const lines = toYaml(item, indent + 2).split('\n')
        return `${pad}- ${lines[0].trimStart()}${lines.length > 1 ? `\n${lines.slice(1).join('\n')}` : ''}`
      }
      return `${pad}- ${toYaml(item).trim()}`
    }).join('\n')
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).map(([key, item]) => {
      if (Array.isArray(item) && item.length === 0) return `${pad}${key}: []`
      if (item !== null && typeof item === 'object') return `${pad}${key}:\n${toYaml(item, indent + 2)}`
      return `${pad}${key}: ${toYaml(item).trim()}`
    }).join('\n')
  }
  if (typeof value === 'string') return quoteYaml(value)
  if (value == null) return 'null'
  return String(value)
}

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
  const view = type === 'review-verdict' ? { ...data, payload: toYaml(data) } : data
  return render(readTemplate(spec.template), view)
}
