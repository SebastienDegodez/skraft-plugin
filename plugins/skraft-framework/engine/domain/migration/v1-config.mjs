/**
 * `skraft-config.json` of skraft v1: an object that carries `trackingLayout`, `observability`
 * and, in older files, the retired `depthTier` and `depthTierRationale`. V2 reads none of them.
 * @typedef {{ dropped: string[], unmapped: string[], kept: Record<string, unknown> }} V1ConfigMigration
 *   dropped: the v1 keys the file holds, in this order; unmapped: the keys that are neither v1
 *   keys nor keys V2 reads, in file order; kept: the object without the dropped keys.
 */

/** The keys only v1 reads. */
const V1_KEYS = Object.freeze(['trackingLayout', 'depthTier', 'depthTierRationale', 'observability'])

/** The keys V2 reads at the top of `skraft-config.json`. */
const V2_KEYS = Object.freeze(['components', 'baseBranch', 'tdd', 'publish', 'models', 'assign'])

/**
 * @param {string} text the content of skraft-config.json
 * @returns {V1ConfigMigration | null} null when the text holds no object with a v1 key
 */
export const v1ConfigMigration = (text) => {
  const raw = parsedObject(text)
  if (raw === null) return null
  const dropped = V1_KEYS.filter((key) => Object.hasOwn(raw, key))
  if (dropped.length === 0) return null
  const kept = Object.fromEntries(Object.entries(raw).filter(([key]) => !V1_KEYS.includes(key)))
  return { dropped, unmapped: Object.keys(kept).filter((key) => !V2_KEYS.includes(key)), kept }
}

/** @param {string} text @returns {Record<string, unknown> | null} */
const parsedObject = (text) => {
  try {
    const value = JSON.parse(text)
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}
