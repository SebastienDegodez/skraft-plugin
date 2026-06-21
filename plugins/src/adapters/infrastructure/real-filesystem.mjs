import { readFile, writeFile, appendFile, mkdir, access } from 'node:fs/promises'

// Thin wrapper around node:fs promises so app code depends on port, not runtime.
export const createRealFilesystem = () => ({
  readFile: (path) => readFile(path, 'utf8'),
  writeFile: (path, content) => writeFile(path, content, 'utf8'),
  appendFile: (path, content) => appendFile(path, content, 'utf8'),
  exists: async (path) => {
    try { await access(path); return true }
    catch { return false }
  },
  mkdir: (path, options) => mkdir(path, { recursive: true, ...options })
})
