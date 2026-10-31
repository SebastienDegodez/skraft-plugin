import { joinRelative } from '../config/relative-path.mjs'

/**
 * The changes a review reads. The patch and the changed paths leave the tracking folder out: a
 * lens that reads documents gets those of the run by their paths, and a blind lens reads none.
 * The tracking folder is the one at the top of a repository: a `.copilot-tracking` folder
 * deeper in the code is code like any other. A blind lens reads the code changes only: the
 * decision records of the run (the files of a `docs/adr` folder) and its design documents (those
 * of `docs/architecture`, `docs/domain/event-model` and `docs/features`) are left out of its copy too.
 * A lens with another scope reads the design documents or the scenarios only.
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

/** The run's decision records and durable design documents: its ADRs, context map, design, event model and scenarios. */
const DOCUMENTS = /(^|\/)docs\/(adr|architecture|domain\/event-model|features)\//

const DESIGN = /(^|\/)docs\/(adr|architecture|domain\/event-model)\//
const FEATURES = /(^|\/)docs\/features\//

/**
 * The part of the changes a lens reads when its scope narrows them: `code` (a blind lens: no
 * decision record and no design document), `design` (the ADRs, context map, design and event
 * model) or `features` (the scenarios).
 * @typedef {'code' | 'design' | 'features'} Scope
 */
const KEPT = /** @type {Readonly<Record<Scope, (path: string) => boolean>>} */ (Object.freeze({
  code: (path) => !DOCUMENTS.test(path),
  design: (path) => DESIGN.test(path),
  features: (path) => FEATURES.test(path),
}))

export const SCOPES = /** @type {readonly Scope[]} */ (Object.freeze(Object.keys(KEPT)))

/**
 * The changes as a lens of this scope reads them: only the sections and paths the scope keeps.
 * @param {{ paths: string[], patch: string }} changes relative to the working copy
 * @param {Scope} scope
 */
export const scopedChanges = ({ paths, patch }, scope) => ({
  paths: paths.filter(KEPT[scope]),
  patch: sectionsOf(patch).filter((section) => KEPT[scope](pathOf(section))).join(''),
})
