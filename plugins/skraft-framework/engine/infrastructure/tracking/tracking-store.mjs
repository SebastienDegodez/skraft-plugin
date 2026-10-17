import { isSlug } from '../../domain/pipeline/slug.mjs'

/**
 * @typedef {{
 *   read: (path: string) => Promise<string | null>,
 *   write: (path: string, text: string) => Promise<void>,
 *   append: (path: string, text: string) => Promise<void>,
 *   join: (...parts: string[]) => string,
 *   list: (path: string) => Promise<string[] | null>,
 * }} FileFunctions
 *   The few file operations the tracking folder needs, on any host: Node's fs or the
 *   Claude Code mod's `$.fs`. read: null when absent. write and append create folders.
 *   list: every file under the folder at any depth, relative to it, `/`-separated; null when
 *   the path is not a folder (or the host cannot list it).
 */

export const TRACKING_FOLDER = ['.copilot-tracking', 'skraft-plans']

/**
 * @typedef {{ files: FileFunctions, at: (slug: string, path: string) => string, activeSlugFile: string }} TrackingFolder
 *   at: the file at a `/`-separated path in a pipeline's folder
 */

/**
 * The tracking folder of a working copy, `<root>/.copilot-tracking/skraft-plans/`, as the
 * three ports the use cases read and write: RunJournalStore, ActivePipeline, TrackingFiles.
 * @param {{ files: FileFunctions, root: string }} options root is the working copy
 */
export const createTrackingStore = ({ files, root }) => {
  const folder = trackingFolder(files, root)
  return Object.freeze({ journal: createJournal(folder), activePipeline: createActivePipeline(folder), files: createTrackingFiles(folder) })
}

/** @param {FileFunctions} files @param {string} root @returns {TrackingFolder} */
const trackingFolder = (files, root) => {
  const base = files.join(root, ...TRACKING_FOLDER)
  const at = (/** @type {string} */ slug, /** @type {string} */ path) => files.join(base, slug, ...path.split('/'))
  return { files, at, activeSlugFile: files.join(base, '.active-slug') }
}

/**
 * @param {TrackingFolder} folder
 * @returns {import('../../application/ports/run-journal-store.mjs').RunJournalStore}
 */
const createJournal = ({ files, at }) =>
  Object.freeze({
    lines: (slug) => journalLines(files, at, slug),
    append: (slug, line) => files.append(at(slug, 'events.jsonl'), `${line}\n`),
  })

/** @param {FileFunctions} files @param {TrackingFolder['at']} at @param {string} slug */
const journalLines = async (files, at, slug) => ((await files.read(at(slug, 'events.jsonl'))) ?? '').split(/\r?\n/).filter((line) => line !== '')

/**
 * @param {TrackingFolder} folder
 * @returns {import('../../application/ports/active-pipeline.mjs').ActivePipeline}
 */
const createActivePipeline = ({ files, activeSlugFile }) =>
  Object.freeze({
    current: () => activeSlug(files, activeSlugFile),
    activate: (slug) => files.write(activeSlugFile, `${slug}\n`),
  })

/** Null unless the file holds a slug. @param {FileFunctions} files @param {string} activeSlugFile */
const activeSlug = async (files, activeSlugFile) => {
  const slug = ((await files.read(activeSlugFile)) ?? '').trim()
  return isSlug(slug) ? slug : null
}

/**
 * @param {TrackingFolder} folder
 * @returns {import('../../application/ports/tracking-files.mjs').TrackingFiles}
 */
const createTrackingFiles = ({ files, at }) =>
  Object.freeze({
    read: (slug, path) => files.read(at(slug, path)),
    write: (slug, path, text) => files.write(at(slug, path), text),
    location: at,
    list: (slug, folder) => listUnder(files, at, slug, folder),
  })

/**
 * Every file under a pipeline's folder, as paths from the pipeline's folder, sorted.
 * @param {FileFunctions} files @param {TrackingFolder['at']} at @param {string} slug @param {string} folder
 */
const listUnder = async (files, at, slug, folder) => {
  const prefix = folder.split('/').filter((part) => part !== '' && part !== '.').join('/')
  const names = (await files.list(at(slug, prefix))) ?? []
  return names.map((name) => (prefix === '' ? name : `${prefix}/${name}`)).sort()
}
