import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { holdsTrackedVia } from './tracked-aliases.mjs'
import { REVIEWS_FOLDER } from './tracking-store.mjs'

/**
 * The ReviewFolder of a working copy on Node's fs: each part of
 * `<root>/.copilot-tracking/skraft-reviews` that exists is a folder, no link, so its real path
 * is that same path under the working copy's own real path; one that cannot be read is refused.
 * A tracked path opens as review state when its file is the review folders' own, by device and
 * inode, whatever its spelling; one the file system cannot tell counts as review state.
 * @param {{ root: string }} options root is the working copy
 * @returns {import('../../application/ports/review-folder.mjs').ReviewFolder}
 */
export const createReviewFolder = ({ root }) => Object.freeze({
  contained: () => isContained(root).catch(() => false),
  holdsTracked: (paths) => holdsTrackedVia((folder, names) => sameAs(root, folder, names), paths).catch(() => true),
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
 * The names that open as the same file as the folder, the link itself when either is one;
 * none when the folder does not exist.
 * @param {string} root @param {string} folder @param {string[]} names relative to root
 * @returns {Promise<string[]>}
 */
export const sameAs = async (root, folder, names) => {
  const target = await identityOf(join(root, folder))
  if (target === null) return []
  const identities = await Promise.all(names.map((name) => identityOf(join(root, name))))
  return names.filter((_, index) => identities[index] === target)
}

/** A file's device and inode, read exactly; null when there is none. @param {string} path */
const identityOf = async (path) => {
  const stats = await lstat(path, { bigint: true }).catch(missing)
  return stats === null ? null : `${stats.dev}:${stats.ino}`
}

/**
 * What stands at the path, the link itself when it is one.
 * @param {string} path @returns {Promise<'folder' | 'missing' | 'other'>}
 */
const partOf = async (path) => {
  const stats = await lstat(path).catch(missing)
  if (stats === null) return 'missing'
  return stats.isDirectory() ? 'folder' : 'other'
}

/** Nothing at the path; any other error is the caller's. @param {NodeJS.ErrnoException} error @returns {null} */
const missing = (error) => {
  if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null
  throw error
}
