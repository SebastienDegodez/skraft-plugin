import { pathToFileURL } from 'node:url'
import { createLock, renewLock, replaceLock } from './lock-file.mjs'
import { createNodeFiles, writeSecret } from '../files/node-files.mjs'
import { keptKey } from '../crypto/journal-keys.mjs'

/** The exit code of a write the lock file refused: it exists, or holds another text. */
export const NOT_DONE = 3

/**
 * The lock file's writes for a host without Node's fs in process (the Claude Code mod):
 * `node lock-file-command.mjs create <path> <text>`, `replace <path> <seen> <text>`,
 * `renew <path> <seen> <text>` or `remove <path> <seen>`, each text URI-encoded; and
 * `make-key <home>`, which makes a journal key under that home folder, kept only its owner
 * reading it, and prints `{"id","key"}` on stdout: the key is on no command line. Exit 0 when
 * done, NOT_DONE when refused.
 * @param {string[]} argv @param {(text: string) => void} [out] stdout
 * @returns {Promise<number>}
 */
export const lockCommand = async ([verb, path, ...texts], out = (text) => process.stdout.write(text)) => {
  if (verb === 'make-key') return madeKey(path, out)
  const [first, second] = texts.map(decodeURIComponent)
  const done = await writeOf(verb)(path, first, second)
  return done ? 0 : NOT_DONE
}

/** @param {string | undefined} verb @returns {(path: string, first: string, second: string) => Promise<boolean>} */
const writeOf = (verb) => {
  if (verb === 'create') return (path, text) => createLock(path, text)
  if (verb === 'replace') return (path, seen, text) => replaceLock(path, seen, text)
  if (verb === 'renew') return (path, seen, text) => renewLock(path, seen, text)
  if (verb === 'remove') return (path, seen) => replaceLock(path, seen, null)
  throw new Error('usage: lock-file-command.mjs create|replace|renew|remove <path> <text>…, make-key <home>')
}

/** @param {string} home @param {(text: string) => void} out */
const madeKey = async (home, out) => {
  out(`${JSON.stringify(await keptKey(createNodeFiles(), home, writeSecret))}\n`)
  return 0
}

// Stryker disable next-line ConditionalExpression,BlockStatement: reached only when a host starts this file as a program
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await lockCommand(process.argv.slice(2))
