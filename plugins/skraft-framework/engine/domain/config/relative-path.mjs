/**
 * Paths relative to the working copy, `/`-separated, as `skraft-config.json` writes them
 * (`services/api`, `../payment-web`). No Node: the mod loads this too.
 */

/**
 * `.` for the working copy itself; no `./`, no trailing `/`, `..` kept only at the front.
 * @param {string} path
 */
export const normalizeRelative = (path) => {
  /** @type {string[]} */
  const parts = []
  for (const part of path.split(/[\\/]/)) {
    if (part === '' || part === '.') continue
    if (part === '..' && parts.length > 0 && parts.at(-1) !== '..') parts.pop()
    else parts.push(part)
  }
  return parts.length === 0 ? '.' : parts.join('/')
}

/** @param {...string} parts */
export const joinRelative = (...parts) => normalizeRelative(parts.join('/'))

/**
 * The part of `path` under `folder`, or null when it is not under it. Both relative to the
 * same place.
 * @param {string} path
 * @param {string} folder
 */
export const pathUnder = (path, folder) => {
  const [inner, outer] = [normalizeRelative(path), normalizeRelative(folder)]
  if (outer === '.') return inner.startsWith('..') ? null : inner
  if (inner === outer) return '.'
  return inner.startsWith(`${outer}/`) ? inner.slice(outer.length + 1) : null
}
