import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * A text that changes when one of the files, or an entry of one of the folders, is created,
 * removed or written: the path, modification time and size of each; a path that cannot be read is
 * stamped absent. It reads no content. Never throws.
 * @param {{ files: string[], folders: string[] }} watched absolute paths
 * @returns {Promise<string>}
 */
export const stampOf = async ({ files, folders }) => {
  const fileStamps = await Promise.all(files.map(fileStamp))
  const folderStamps = await Promise.all(folders.map(folderStamp))
  return JSON.stringify([...fileStamps, ...folderStamps])
}

/** @param {string} path */
const fileStamp = async (path) => {
  try {
    const { mtimeMs, size } = await stat(path)
    return [path, mtimeMs, size]
  } catch {
    return [path, null]
  }
}

/** @param {string} path */
const folderStamp = async (path) => {
  const names = await readdir(path).catch(() => null)
  if (names === null) return [path, null]
  return [path, await Promise.all(names.sort().map((name) => fileStamp(join(path, name))))]
}
