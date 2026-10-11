import { isSlug } from '../../domain/pipeline/slug.mjs'

/**
 * @typedef {{
 *   read: (path: string) => Promise<string | null>,
 *   write: (path: string, text: string) => Promise<void>,
 *   append: (path: string, text: string) => Promise<void>,
 *   join: (...parts: string[]) => string,
 * }} FileFunctions
 *   The few file operations the tracking folder needs, on any host: Node's fs or the
 *   Claude Code mod's `$.fs`. read: null when absent. write and append create folders.
 */

export const TRACKING_FOLDER = ['.copilot-tracking', 'skraft-plans']

/**
 * The tracking folder of a working copy, `<root>/.copilot-tracking/skraft-plans/`, as the
 * three ports the use cases read and write: RunJournalStore, ActivePipeline, TrackingFiles.
 * @param {{ files: FileFunctions, root: string }} options root is the working copy
 */
export const createTrackingStore = ({ files, root }) => {
  const base = files.join(root, ...TRACKING_FOLDER)
  const at = (/** @type {string} */ slug, /** @type {string} */ path) => files.join(base, slug, ...path.split('/'))
  const activeSlugFile = files.join(base, '.active-slug')

  /** @type {import('../../application/ports/run-journal-store.mjs').RunJournalStore} */
  const journal = Object.freeze({
    lines: async (slug) => ((await files.read(at(slug, 'events.jsonl'))) ?? '').split(/\r?\n/).filter((line) => line !== ''),
    append: (slug, line) => files.append(at(slug, 'events.jsonl'), `${line}\n`),
  })

  /** @type {import('../../application/ports/active-pipeline.mjs').ActivePipeline} */
  const activePipeline = Object.freeze({
    current: async () => {
      const slug = ((await files.read(activeSlugFile)) ?? '').trim()
      return isSlug(slug) ? slug : null
    },
    activate: (slug) => files.write(activeSlugFile, `${slug}\n`),
  })

  /** @type {import('../../application/ports/tracking-files.mjs').TrackingFiles} */
  const trackingFiles = Object.freeze({
    read: (slug, path) => files.read(at(slug, path)),
    write: (slug, path, text) => files.write(at(slug, path), text),
    location: at,
  })

  return Object.freeze({ journal, activePipeline, files: trackingFiles })
}
