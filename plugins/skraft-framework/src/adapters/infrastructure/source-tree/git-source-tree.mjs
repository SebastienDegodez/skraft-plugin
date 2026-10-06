// SourceTree (ports/infrastructure/source-tree.mjs) on a git runner and a file reader:
// files are `git ls-files --cached --others --exclude-standard`, or `listAll()` outside a
// repository. No Node API here: the host passes
//   git(args)        => Promise<string | null>
//   sizeOf(path)     => Promise<number | null>   repository-relative; null when not a file
//   readText(path)   => Promise<string>          repository-relative; rejects when absent
//   listAll()        => Promise<string[]>        fallback walk, repository-relative
export const createGitSourceTree = ({ git, sizeOf, readText, listAll }) => Object.freeze({
  listFiles: async () => {
    const listed = await git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
    if (listed !== null) return listed.split('\0').filter(Boolean)
    return (await listAll()).map((path) => String(path).split('\\').join('/'))
  },
  readSource: async (path, maxBytes) => {
    try {
      const size = await sizeOf(path)
      if (size === null || size > maxBytes) return null
      return await readText(path)
    } catch {
      return null
    }
  },
})
