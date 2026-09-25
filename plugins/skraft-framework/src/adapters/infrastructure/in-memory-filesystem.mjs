// Fake filesystem for tests. Same shape, everything stays in RAM.
// initialFiles values may be a plain string (content) or { content, mtimeMs } so
// tests can date entries for housekeeping (US12).
// Paths are keyed with forward slashes: a service's path.join spells them with
// backslashes on Windows, a test with slashes, and both must name the same file.
const keyOf = (path) => String(path).replace(/\\/g, '/')

export const createInMemoryFilesystem = (initialFiles = {}) => {
  const files = new Map()
  for (const [path, value] of Object.entries(initialFiles)) {
    if (value !== null && typeof value === 'object') {
      files.set(keyOf(path), { content: value.content ?? '', mtimeMs: value.mtimeMs ?? 0 })
    } else {
      files.set(keyOf(path), { content: value, mtimeMs: 0 })
    }
  }
  return {
    readFile: async (path) => {
      if (!files.has(keyOf(path))) throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' })
      return files.get(keyOf(path)).content
    },
    writeFile: async (path, content) => { files.set(keyOf(path), { content, mtimeMs: files.get(keyOf(path))?.mtimeMs ?? 0 }) },
    appendFile: async (path, content) => {
      const prev = files.get(keyOf(path))
      files.set(keyOf(path), { content: (prev?.content ?? '') + content, mtimeMs: prev?.mtimeMs ?? 0 })
    },
    exists: async (path) => files.has(keyOf(path)),
    mkdir: async () => {},
    listDir: async (path) => {
      const dir = keyOf(path)
      const prefix = dir === '' ? '' : `${dir}/`
      const names = new Set()
      for (const key of files.keys()) {
        if (key === dir || !key.startsWith(prefix)) continue
        names.add(key.slice(prefix.length).split('/')[0])
      }
      return [...names]
    },
    stat: async (path) => {
      if (!files.has(keyOf(path))) throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' })
      const entry = files.get(keyOf(path))
      return { mtimeMs: entry.mtimeMs, size: entry.content.length, isFile: true }
    },
    remove: async (path) => { files.delete(keyOf(path)) },
    _files: files
  }
}
