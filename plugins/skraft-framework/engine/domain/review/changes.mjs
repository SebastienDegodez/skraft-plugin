/**
 * The changes a review reads. The patch leaves the tracking folder out, since a lens gets the
 * documents of the run by their paths; the changed paths keep the documents the agents wrote
 * there, and leave out what the engine itself keeps (journal, results, reviews).
 */

const TRACKING = '.copilot-tracking/'
const ENGINE_FILES = /(^|\/)events\.jsonl$|(^|\/)(results|reviews)\//

/** @param {string} path relative to its repository or to the working copy */
const tracked = (path) => path.startsWith(TRACKING) || path.includes(`/${TRACKING}`)

/** @param {string[]} paths @returns {string[]} */
export const reviewedPaths = (paths) => paths.filter((path) => !(tracked(path) && ENGINE_FILES.test(path)))

/**
 * A unified diff without the sections of tracking files.
 * @param {string} patch the output of `git diff`
 */
export const reviewedPatch = (patch) => sectionsOf(patch).filter((section) => !tracked(pathOf(section))).join('')

/** The file sections of a diff, each from its `diff --git` line, with what precedes the first. @param {string} patch */
const sectionsOf = (patch) => patch.split(/(?=^diff --git )/m)

/** The path a section changes, '' for text before the first section. @param {string} section */
const pathOf = (section) => /^diff --git a\/(\S+)/.exec(section)?.[1] ?? ''
