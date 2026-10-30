import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { CONFIG_FILE, LOCAL_CONFIG_FILE } from '../../domain/config/skraft-config.mjs'
import { isSlug } from '../../domain/pipeline/slug.mjs'
import { TRACKING_FOLDER } from '../../infrastructure/tracking/tracking-store.mjs'

/**
 * What the Configuration and Workflow tabs read that a person edits, and the run the Workflow tab
 * draws, as one digest: the configuration files of the working copy and of the home folder, the
 * Git config (the remote the forge is deduced from), the ejected workflows, the agent folders
 * (names and content), the skill folders (names, and whether each holds its SKILL.md), and the size
 * of the active run's journal, which every event grows. Compared by content, never by modification
 * time. Null when it cannot be told (not a Git repository folder, a read that failed): the tabs are
 * then read again, as without a digest. Reads `error.code` only, never an exception's text.
 * @param {{ cwd: string, home: string }} where @returns {Promise<string | null>}
 */
export const editedDigest = async ({ cwd, home }) => {
  try {
    return (await isFolder(join(cwd, '.git'))) ? digest(await partsOf(cwd, home)) : null
  } catch {
    return null
  }
}

const ABSENT = 'absent'
const NONE = 'none'

/** What a missing file or folder is: the same part as long as it is missing. @param {unknown} error */
const isMissing = (error) => ['ENOENT', 'ENOTDIR'].includes(/** @type {any} */ (error)?.code)

/** @template T @param {() => Promise<T>} read @returns {Promise<T | typeof ABSENT>} */
const orAbsent = async (read) => {
  try {
    return await read()
  } catch (error) {
    if (isMissing(error)) return ABSENT
    throw error
  }
}

/** @param {string} path */
const isFolder = async (path) => {
  const found = await orAbsent(() => stat(path))
  return found !== ABSENT && found.isDirectory()
}

/** The bytes of a file, as text that keeps every byte. @param {string} path */
const textOf = (path) => orAbsent(async () => (await readFile(path)).toString('latin1'))

/** @param {string} path */
const hasFile = async (path) => (await orAbsent(() => stat(path))) !== ABSENT

/** @param {{ name: string }} left @param {{ name: string }} right */
const byName = (left, right) => (left.name < right.name ? -1 : 1)

/**
 * Each file of a folder with its content (the subfolders are left out), or each entry of a folder
 * with whether a folder holds its SKILL.md: by name, in the same order on every file system.
 * @param {string} path @param {boolean} withContent
 */
const folderParts = async (path, withContent) => {
  const entries = await orAbsent(() => readdir(path, { withFileTypes: true }))
  if (entries === ABSENT) return ABSENT
  const kept = entries.filter((entry) => !withContent || entry.isFile()).sort(byName)
  return Promise.all(kept.map((entry) => entryPart(path, entry, withContent)))
}

/** @param {string} path @param {import('node:fs').Dirent} entry @param {boolean} withContent */
const entryPart = async (path, entry, withContent) => {
  if (withContent) return [entry.name, await textOf(join(path, entry.name))]
  return [entry.name, entry.isDirectory() ? await hasFile(join(path, entry.name, 'SKILL.md')) : null]
}

/** The size of the active run's journal; NONE when no slug is active, as a slug only. @param {string} cwd @param {string | null} slug */
const journalSize = async (cwd, slug) => {
  if (!isSlug(slug)) return NONE
  const found = await orAbsent(() => stat(join(cwd, ...TRACKING_FOLDER, /** @type {string} */ (slug), 'events.jsonl')))
  return found === ABSENT ? ABSENT : found.size
}

/** @param {string} cwd @returns {Promise<string | null>} the active slug, null when none is written */
const activeSlug = async (cwd) => {
  const text = await textOf(join(cwd, ...TRACKING_FOLDER, '.active-slug'))
  return text === ABSENT ? null : text.trim()
}

/** @param {string} cwd @param {string} home */
const filesOf = (cwd, home) => [
  join(cwd, CONFIG_FILE), join(cwd, LOCAL_CONFIG_FILE), join(home, '.skraft', 'config.json'), join(cwd, '.git', 'config'),
]

/** The folders read by content, then those read by name. @param {string} cwd */
const foldersOf = (cwd) => [
  [join(cwd, '.skraft'), true], [join(cwd, '.github', 'agents'), true], [join(cwd, '.claude', 'agents'), true],
  [join(cwd, '.github', 'skills'), false], [join(cwd, '.claude', 'skills'), false],
]

/** @param {string} cwd @param {string} home */
const partsOf = async (cwd, home) => {
  const slug = await activeSlug(cwd)
  const files = await Promise.all(filesOf(cwd, home).map(textOf))
  const folders = await Promise.all(foldersOf(cwd).map(([path, withContent]) => folderParts(String(path), Boolean(withContent))))
  return [cwd, home, files, folders, slug, await journalSize(cwd, slug)]
}

/** @param {unknown} parts */
const digest = (parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex')
