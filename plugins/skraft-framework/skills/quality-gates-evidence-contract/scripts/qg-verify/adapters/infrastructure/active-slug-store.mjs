import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { isValidProjectSlug } from '../../domain/value-objects.mjs'

// The active pipeline, recorded beside the tracked projects so hooks — whose payloads
// carry no project slug — act on the pipeline the state CLI last opened or selected.
export const ACTIVE_SLUG_FILE = '.active-slug'

export const createActiveSlugStore = (trackingRoot) => ({
  // Never throws: a missing, unreadable or malformed pointer reads as no active pipeline.
  read: () => {
    try {
      const slug = readFileSync(join(trackingRoot, ACTIVE_SLUG_FILE), 'utf8').trim()
      return isValidProjectSlug(slug) ? slug : null
    } catch {
      return null
    }
  },
  write: (slug) => {
    mkdirSync(trackingRoot, { recursive: true })
    writeFileSync(join(trackingRoot, ACTIVE_SLUG_FILE), `${slug}\n`, 'utf8')
  },
})
