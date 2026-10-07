import { execFile } from 'node:child_process'

// The git runner of Node hosts: git(args) => Promise<stdout | null>. Never rejects.
export const createNodeGitRunner = ({ cwd }) => (args) => new Promise((resolve) => {
  execFile('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => resolve(error ? null : stdout))
})
