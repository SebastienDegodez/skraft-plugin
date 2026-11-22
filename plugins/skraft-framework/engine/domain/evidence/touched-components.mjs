import { normalizeRelative, pathUnder } from '../config/relative-path.mjs'

/** Changes under the tracking folder are the run's own bookkeeping, never a component's. */
const TRACKING = '.copilot-tracking'

/**
 * Whether the files changed since a component's base touch it. A file under another component
 * whose root sits inside this one belongs to that one; a root equal to this one's takes nothing away.
 * @param {{ root: string }} component
 * @param {Array<{ root: string }>} components every component of the configuration
 * @param {string[]} changed paths relative to the component's root
 */
export const isTouchedBy = (component, components, changed) => {
  const nested = components
    .map((other) => pathUnder(other.root, component.root))
    .filter((/** @type {string | null} */ inner) => inner !== null && inner !== '.')
  return changed.some((path) => {
    const file = normalizeRelative(path)
    return pathUnder(file, TRACKING) === null && !nested.some((inner) => pathUnder(file, /** @type {string} */ (inner)) !== null)
  })
}
