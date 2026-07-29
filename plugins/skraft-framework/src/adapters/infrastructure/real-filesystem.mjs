import { readFile, writeFile, appendFile, mkdir, access, readdir, stat, unlink } from 'node:fs/promises'

// Thin wrapper around node:fs promises so app code depends on port, not runtime.
export const createRealFilesystem = () => ({
  readFile: (path) => readFile(path, 'utf8'),
  writeFile: (path, content) => writeFile(path, content, 'utf8'),
  appendFile: (path, content) => appendFile(path, content, 'utf8'),
  exists: async (path) => {
    try { await access(path); return true }
    catch { return false }
  },
  mkdir: (path, options) => mkdir(path, { recursive: true, ...options }),
  // Housekeeping helpers (US12). listDir returns [] for a missing directory so
  // callers stay fail-open; stat exposes only mtimeMs; remove ignores ENOENT.
  listDir: async (path) => {
    try { return await readdir(path) }
    catch (err) { if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return []; throw err }
  },
  stat: async (path) => {
    const s = await stat(path)
    return { mtimeMs: s.mtimeMs, size: s.size, isFile: s.isFile() }
  },
  remove: async (path) => {
    try { await unlink(path) }
    catch (err) { if (err.code !== 'ENOENT') throw err }
  }
})
