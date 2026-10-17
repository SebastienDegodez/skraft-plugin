import { joinRelative } from '../config/relative-path.mjs'

/**
 * The changes a review reads. The patch leaves the tracking folder out, since a lens gets the
 * documents of the run by their paths; the changed paths keep the documents the agents wrote
 * there, and leave out what the engine itself keeps (journal, results, reviews). The tracking
 * folder is the one at the top of a repository: a `.copilot-tracking` folder deeper in the
 * code is code like any other.
 */

const TRACKING = '.copilot-tracking/'
const ENGINE_FILES = /^\.copilot-tracking\/skraft-plans\/[^/]+\/(events\.jsonl$|results\/|reviews\/)/

/** @param {string} path relative to its repository */
const tracked = (path) => path.startsWith(TRACKING)

/**
 * @param {string[]} paths relative to the repository
 * @param {string} repository its folder, relative to the working copy
 * @returns {string[]} relative to the working copy
 */
export const reviewedPaths = (paths, repository) => paths.filter((path) => !ENGINE_FILES.test(path)).map((path) => joinRelative(repository, path))

/**
 * A unified diff without the sections of tracking files, its paths made relative to the
 * working copy.
 * @param {string} patch the output of `git diff` in the repository
 * @param {string} repository its folder, relative to the working copy
 */
export const reviewedPatch = (patch, repository) => sectionsOf(patch)
  .filter((section) => !tracked(pathOf(section)))
  .map((section) => (repository === '.' ? section : rebased(section, repository)))
  .join('')

/** @param {string} section @param {string} repository */
const rebased = (section, repository) => section.replace(/^(diff --git a\/)(\S+)( b\/)(\S+)|^(--- a\/|\+\+\+ b\/)(\S+)/gm, (line, git, from, b, to, side, path) => (
  git === undefined ? `${side}${joinRelative(repository, path)}` : `${git}${joinRelative(repository, from)}${b}${joinRelative(repository, to)}`
))

/** The file sections of a diff, each from its `diff --git` line, with what precedes the first. @param {string} patch */
const sectionsOf = (patch) => patch.split(/(?=^diff --git )/m)

/** The path a section changes, '' for text before the first section. @param {string} section */
const pathOf = (section) => /^diff --git a\/(\S+)/.exec(section)?.[1] ?? ''
