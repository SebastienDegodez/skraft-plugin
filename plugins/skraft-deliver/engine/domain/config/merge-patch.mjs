/**
 * JSON Merge Patch (RFC 7386): a patch object merges into the target key by key, `null`
 * removes the key, and anything else (a list, a string, a number) replaces what was there.
 * @param {unknown} target @param {unknown} patch @returns {unknown}
 */
export const mergePatch = (target, patch) => {
  if (!isRecord(patch)) return patch
  const merged = new Map(Object.entries(isRecord(target) ? target : {}))
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) merged.delete(key)
    else merged.set(key, mergePatch(merged.get(key), value))
  }
  return Object.fromEntries(merged)
}

/** A JSON object: neither a list nor null. @param {unknown} value @returns {value is Record<string, unknown>} */
const isRecord = (value) => Object.prototype.toString.call(value) === '[object Object]'
