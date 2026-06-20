export const createInMemoryFilesystem = (initialFiles = {}) => {
  const files = new Map(Object.entries(initialFiles))
  return {
    readFile: async (path) => {
      if (!files.has(path)) throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' })
      return files.get(path)
    },
    writeFile: async (path, content) => { files.set(path, content) },
    appendFile: async (path, content) => { files.set(path, (files.get(path) ?? '') + content) },
    exists: async (path) => files.has(path),
    mkdir: async () => {},
    _files: files
  }
}
