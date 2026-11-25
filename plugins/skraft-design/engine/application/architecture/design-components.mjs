import { loadConfig } from '../config/bases.mjs'
import { newComponents } from '../config/detected-components.mjs'

/**
 * The components a design run's briefs may cite, each by its root, with its stack: those of
 * skraft-design-config.json, else the projects the working copy holds, detected at each run and
 * kept nowhere but the run's plans/components.json (#669).
 */
export const COMPONENTS_FILE = 'plans/components.json'

/** @param {any} deps @returns {Promise<Array<{ root: string, stack: string }>>} */
export const designComponents = async (deps) => {
  const loaded = await loadConfig(deps)
  const configured = loaded.ok ? loaded.config.components : []
  const found = configured.length > 0 ? configured : await newComponents(deps.workspace, ['.'], [], { workingCopyName: 'working-copy' })
  return found.map(({ root, stack }) => ({ root, stack }))
}

/**
 * What a brief cites that no component of the run is: by its root, or by the name
 * skraft-design-config.json gives it, as briefs written before #669 do.
 * @param {any} deps @param {string} slug @param {{ components: string[] }} brief @returns {Promise<string[]>}
 */
export const unknownComponents = async (deps, slug, brief) => {
  const known = JSON.parse((await deps.files.read(slug, COMPONENTS_FILE)) ?? '[]')
  const loaded = await loadConfig(deps)
  const names = loaded.ok ? loaded.config.components.map(({ name }) => name) : []
  const cited = new Set([...known.map(({ root }) => root), ...names])
  return brief.components.filter((component) => !cited.has(component)).map((component) => componentFailure(component, known))
}

/** @param {string} component @param {Array<{ root: string }>} known */
const componentFailure = (component, known) => `${component}: no component of this working copy has that root; cite one of ${known.map(({ root }) => root).join(', ') || 'none detected'}.`
