// Fake filesystem for tests. Same shape, everything stays in RAM.
// initialFiles values may be a plain string (content) or { content, mtimeMs } so
// tests can date entries for housekeeping (US12).
export const createInMemoryFilesystem = (initialFiles = {}) => {
  const files = new Map()
  for (const [path, value] of Object.entries(initialFiles)) {
    if (value !== null && typeof value === 'object') {
      files.set(path, { content: value.content ?? '', mtimeMs: value.mtimeMs ?? 0 })
    } else {
      files.set(path, { content: value, mtimeMs: 0 })
    }
  }
  return {
    readFile: async (path) => {
      if (!files.has(path)) throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' })
      return files.get(path).content
    },
    writeFile: async (path, content) => { files.set(path, { content, mtimeMs: files.get(path)?.mtimeMs ?? 0 }) },
    appendFile: async (path, content) => {
      const prev = files.get(path)
      files.set(path, { content: (prev?.content ?? '') + content, mtimeMs: prev?.mtimeMs ?? 0 })
    },
    exists: async (path) => files.has(path),
    mkdir: async () => {},
    listDir: async (path) => {
      const prefix = path === '' ? '' : `${path}/`
      const names = new Set()
      for (const key of files.keys()) {
        if (key === path || !key.startsWith(prefix)) continue
        names.add(key.slice(prefix.length).split('/')[0])
      }
      return [...names]
    },
    stat: async (path) => {
      if (!files.has(path)) throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' })
      const entry = files.get(path)
      return { mtimeMs: entry.mtimeMs, size: entry.content.length, isFile: true }
    },
    remove: async (path) => { files.delete(path) },
    _files: files
  }
}
