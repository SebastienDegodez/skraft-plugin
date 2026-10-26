import { randomUUID } from 'node:crypto'
import { link, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { TRACKING_FOLDER } from './tracking-store.mjs'

/**
 * The RunLock of a working copy on Node's fs, `<root>/.copilot-tracking/skraft-plans/<slug>/.lock`.
 * Each write is one call the OS makes all or nothing, on Windows, macOS and Linux alike: a new
 * file is written aside then hard-linked in place (the link fails when the lock exists); a
 * replaced one is first renamed aside (one session only can) and read back; a renewed one is
 * written aside then renamed over the lock file, which is never absent meanwhile.
 * @param {{ root: string, owner?: string }} options root is the working copy
 * @returns {import('../../application/ports/run-lock.mjs').RunLock}
 */
export const createNodeRunLock = ({ root, owner = randomUUID() }) => Object.freeze({
  owner,
  read: (slug) => readOrNull(lockPath(root, slug)),
  create: (slug, text) => createLock(lockPath(root, slug), text),
  replace: (slug, seen, text) => replaceLock(lockPath(root, slug), seen, text),
  renew: (slug, seen, text) => renewLock(lockPath(root, slug), seen, text),
})

/** @param {string} root @param {string} slug */
const lockPath = (root, slug) => join(root, ...TRACKING_FOLDER, slug, '.lock')

/** @param {string} path @returns {Promise<string | null>} */
const readOrNull = (path) => readFile(path, 'utf8').catch(nullWhenMissing)

/** @param {unknown} error @returns {null} */
const nullWhenMissing = (error) => {
  if (codeOf(error) === 'ENOENT') return null
  throw error
}

/** @param {unknown} error */
const codeOf = (error) => /** @type {NodeJS.ErrnoException} */ (error).code

/**
 * The lock file with its whole text, only when there is none.
 * @param {string} path @param {string} text @returns {Promise<boolean>}
 */
export const createLock = async (path, text) => {
  const aside = `${path}.${randomUUID()}`
  await mkdir(dirname(path), { recursive: true })
  await writeFile(aside, text, 'utf8')
  try {
    return await linked(aside, path)
  } finally {
    await unlink(aside).catch(() => undefined)
  }
}

/** @param {string} from @param {string} to @returns {Promise<boolean>} false when `to` exists */
const linked = (from, to) => link(from, to).then(() => true, (error) => {
  if (codeOf(error) === 'EEXIST') return false
  throw error
})

/**
 * Text in place of the lock file (null removes it) only while it holds seen: the file renamed
 * aside belongs to this call alone; the wrong one goes back unless a new lock took its place.
 * @param {string} path @param {string} seen @param {string | null} text @returns {Promise<boolean>}
 */
export const replaceLock = async (path, seen, text) => {
  const aside = `${path}.${randomUUID()}`
  if (!(await renamed(path, aside))) return false
  try {
    if ((await readFile(aside, 'utf8')) !== seen) return await putBack(aside, path)
    return text === null || (await createLock(path, text))
  } finally {
    await unlink(aside).catch(() => undefined)
  }
}

/**
 * Text in place of the lock file while it holds seen, by one rename over it: Node renames over
 * an existing file on POSIX and on Windows (MoveFileEx with MOVEFILE_REPLACE_EXISTING).
 * @param {string} path @param {string} seen @param {string} text @returns {Promise<boolean>}
 */
export const renewLock = async (path, seen, text) => {
  const aside = `${path}.${randomUUID()}`
  await writeFile(aside, text, 'utf8')
  try {
    return (await readOrNull(path)) === seen && (await renamed(aside, path))
  } finally {
    await unlink(aside).catch(() => undefined)
  }
}

/** @param {string} from @param {string} to @returns {Promise<false>} */
const putBack = async (from, to) => {
  await linked(from, to)
  return false
}

/**
 * Renames a file; false when it is gone. Windows refuses a rename while another process reads
 * the file: the rename is tried again a few times.
 * @param {string} from @param {string} to @returns {Promise<boolean>}
 */
const renamed = async (from, to) => {
  for (let tries = 1; ; tries += 1) {
    const outcome = await rename(from, to).then(() => true, (error) => renameRefusal(error, tries))
    if (outcome !== null) return outcome
    await new Promise((resolve) => setTimeout(resolve, 20 * tries))
  }
}

const BUSY = new Set(['EPERM', 'EBUSY', 'EACCES'])
const TRIES = 5

/** @param {unknown} error @param {number} tries @returns {false | null} null to try again */
const renameRefusal = (error, tries) => {
  if (codeOf(error) === 'ENOENT') return false
  if (BUSY.has(/** @type {string} */ (codeOf(error))) && tries < TRIES) return null
  throw error
}
