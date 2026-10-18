import { normalizeRelative } from '../config/relative-path.mjs'
import { trackingFolder } from '../pipeline/roles.mjs'

/**
 * A finding's location in its shortest form: relative to the working copy, `/`-separated, no
 * `./`, its `:line` kept. A lens may cite the absolute path its brief gave it, or a Windows one.
 */

const ABSOLUTE = /^([A-Za-z]:)?\//
const LINE = /^(.*?)(:\d[\d,-]*)?$/

/**
 * The working copy's absolute path, from where the tracking folder of a slug sits in it.
 * @param {string} tracked the absolute location of `<slug>/marker` in the tracking folder
 * @param {string} slug
 */
export const workingCopyOf = (tracked, slug) => tracked.replaceAll('\\', '/').slice(0, -`/${trackingFolder(slug)}/marker`.length)

/** @param {string} location @param {string} root the working copy's absolute path */
export const shortLocation = (location, root) => {
  if (location === '') return location
  const [, path, line = ''] = /** @type {RegExpExecArray} */ (LINE.exec(location.replaceAll('\\', '/')))
  const inside = path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path
  return `${ABSOLUTE.test(inside) ? inside : normalizeRelative(inside)}${line}`
}
