import { joinRelative } from '../config/relative-path.mjs'

/**
 * The changes a review reads. The patch and the changed paths leave the tracking folder out: a
 * lens that reads documents gets those of the run by their paths, and a blind lens reads none.
 * The tracking folder is the one at the top of a repository: a `.copilot-tracking` folder
 * deeper in the code is code like any other.
 */

const TRACKING = '.copilot-tracking/'

/** @param {string} path relative to its repository */
const tracked = (path) => path.startsWith(TRACKING)

/**
 * @param {string[]} paths relative to the repository
 * @param {string} repository its folder, relative to the working copy
 * @returns {string[]} relative to the working copy
 */
export const reviewedPaths = (paths, repository) => paths.filter((path) => !tracked(path)).map((path) => joinRelative(repository, path))

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

/** A section's header; with renames off, both sides name the same path, which may hold spaces. */
const HEADER = /^diff --git a\/(.+) b\/\1$/m
/** A `---` or `+++` line; the tab Git adds after a path that holds a space stays at its end. */
const SIDE = /^(--- a\/|\+\+\+ b\/)(.+)$/gm

/** @param {string} section @param {string} repository */
const rebased = (section, repository) => section
  .replace(HEADER, (_, path) => `diff --git a/${joinRelative(repository, path)} b/${joinRelative(repository, path)}`)
  .replace(SIDE, (_, side, path) => `${side}${joinRelative(repository, path)}`)

/** The file sections of a diff, each from its `diff --git` line, with what precedes the first. @param {string} patch */
const sectionsOf = (patch) => patch.split(/(?=^diff --git )/m)

/** The path a section changes, '' for text before the first section. @param {string} section */
const pathOf = (section) => HEADER.exec(section)?.[1] ?? ''
