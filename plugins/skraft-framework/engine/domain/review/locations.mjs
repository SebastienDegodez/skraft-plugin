import { normalizeRelative } from '../config/relative-path.mjs'

/**
 * A finding's location in its shortest form: relative to the working copy, `/`-separated, no
 * `./`, its `:line` kept. A lens may cite the absolute path its brief gave it, or a Windows one.
 */

const ABSOLUTE = /^([A-Za-z]:)?\//
const LINE = /^(.*?)(:\d[\d,-]*)?$/

/**
 * The working copy's absolute path, from where a slug's folder sits in it: four parts up from
 * `.copilot-tracking/<skraft-plans or skraft-reviews>/<slug>/marker`.
 * @param {string} tracked the absolute location of `<slug>/marker` in its tracking folder
 */
export const workingCopyOf = (tracked) => tracked.replaceAll('\\', '/').split('/').slice(0, -4).join('/')

/** @param {string} location @param {string} root the working copy's absolute path */
export const shortLocation = (location, root) => {
  if (location === '') return location
  const [, path, line = ''] = /** @type {RegExpExecArray} */ (LINE.exec(location.replaceAll('\\', '/')))
  const inside = path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path
  return `${ABSOLUTE.test(inside) ? inside : normalizeRelative(inside)}${line}`
}
