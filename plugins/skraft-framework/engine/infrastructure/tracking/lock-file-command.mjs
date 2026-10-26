import { pathToFileURL } from 'node:url'
import { createLock, replaceLock } from './lock-file.mjs'

/** The exit code of a write the lock file refused: it exists, or holds another text. */
export const NOT_DONE = 3

/**
 * The lock file's writes for a host without Node's fs in process (the Claude Code mod):
 * `node lock-file-command.mjs create <path> <text>`, `replace <path> <seen> <text>` or
 * `remove <path> <seen>`, each text URI-encoded. Exit 0 when done, NOT_DONE when refused.
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
export const lockCommand = async ([verb, path, ...texts]) => {
  const [first, second] = texts.map(decodeURIComponent)
  const done = await writeOf(verb)(path, first, second)
  return done ? 0 : NOT_DONE
}

/** @param {string | undefined} verb @returns {(path: string, first: string, second: string) => Promise<boolean>} */
const writeOf = (verb) => {
  if (verb === 'create') return (path, text) => createLock(path, text)
  if (verb === 'replace') return (path, seen, text) => replaceLock(path, seen, text)
  if (verb === 'remove') return (path, seen) => replaceLock(path, seen, null)
  throw new Error('usage: lock-file-command.mjs create|replace|remove <path> <text>…')
}

// Stryker disable next-line ConditionalExpression,BlockStatement: reached only when a host starts this file as a program
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await lockCommand(process.argv.slice(2))
