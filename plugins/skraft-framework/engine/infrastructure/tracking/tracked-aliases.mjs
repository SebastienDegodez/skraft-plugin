import { REVIEWS_FOLDER } from './tracking-store.mjs'

/**
 * Which tracked paths open as the tracking folder or the review folder, asked of the file system
 * rather than read from their spelling: shared by the Node host and the Claude Code mod, which
 * asks node. No Node module here: the mod imports it.
 *
 * @typedef {(folder: string, names: string[]) => Promise<string[]>} SameAs
 *   the names, relative to the working copy, that open there as the same file as folder (the
 *   link itself, never what it points to); none when folder does not exist.
 */

const TRACKING = REVIEWS_FOLDER[0]
const REVIEWS = REVIEWS_FOLDER.join('/')

/**
 * Whether any path opens as the tracking folder itself, or as the review folder or under it:
 * first the first segments that open as the tracking folder, then, under those, the second ones
 * that open as the review folder.
 * @param {SameAs} sameAs @param {string[]} paths relative to the working copy, `/`-separated
 * @returns {Promise<boolean>}
 */
export const holdsTrackedVia = async (sameAs, paths) => {
  const split = paths.map((path) => path.split('/'))
  const trackings = new Set(await asked(sameAs, TRACKING, split.map(([first]) => first)))
  const under = split.filter(([first]) => trackings.has(first))
  if (under.some((parts) => parts.length === 1)) return true
  return (await asked(sameAs, REVIEWS, under.map(([first, second]) => `${first}/${second}`))).length > 0
}

/** The file system asked once per distinct name, not at all for none. @param {SameAs} sameAs @param {string} folder @param {string[]} names */
const asked = (sameAs, folder, names) => {
  const distinct = [...new Set(names)]
  return distinct.length === 0 ? Promise.resolve([]) : sameAs(folder, distinct)
}
