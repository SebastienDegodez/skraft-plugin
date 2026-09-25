import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

// Files of one project's tracking directory ({trackingRoot}/{slug}/), addressed by the
// tracking-relative paths the state records.
export const createTrackingFiles = (trackingRoot) => ({
  exists: async (slug, relPath) => {
    try { return (await stat(join(trackingRoot, slug, relPath))).isFile() } catch { return false }
  },
  read: (slug, relPath) => readFile(join(trackingRoot, slug, relPath), 'utf8'),
})
