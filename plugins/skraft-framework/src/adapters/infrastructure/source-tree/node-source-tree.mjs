import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createGitSourceTree } from './git-source-tree.mjs'
import { createNodeGitRunner } from '../git/node-git-runner.mjs'

// SourceTree for Node hosts: the git-based tree over the local file system.
export const createNodeSourceTree = ({ cwd }) => createGitSourceTree({
  git: createNodeGitRunner({ cwd }),
  sizeOf: async (path) => {
    try {
      const info = await stat(join(cwd, path))
      return info.isFile() ? info.size : null
    } catch {
      return null
    }
  },
  readText: (path) => readFile(join(cwd, path), 'utf8'),
  listAll: async () => (await readdir(cwd, { recursive: true })).map(String),
})
