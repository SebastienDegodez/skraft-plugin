import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { REVIEWS_FOLDER } from './tracking-store.mjs'

/**
 * The ReviewFolder of a working copy on Node's fs: each part of
 * `<root>/.copilot-tracking/skraft-reviews` that exists is a folder, no link, so its real path
 * is that same path under the working copy's own real path; one that cannot be read is refused.
 * @param {{ root: string }} options root is the working copy
 * @returns {import('../../application/ports/review-folder.mjs').ReviewFolder}
 */
export const createReviewFolder = ({ root }) => Object.freeze({
  contained: () => isContained(root).catch(() => false),
})

/** @param {string} root @returns {Promise<boolean>} */
export const isContained = async (root) => {
  for (const depth of REVIEWS_FOLDER.keys()) {
    const part = await partOf(join(root, ...REVIEWS_FOLDER.slice(0, depth + 1)))
    if (part === 'missing') return true
    if (part === 'other') return false
  }
  return true
}

/**
 * What stands at the path, the link itself when it is one.
 * @param {string} path @returns {Promise<'folder' | 'missing' | 'other'>}
 */
const partOf = async (path) => {
  const stats = await lstat(path).catch((/** @type {NodeJS.ErrnoException} */ error) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (stats === null) return 'missing'
  return stats.isDirectory() ? 'folder' : 'other'
}
