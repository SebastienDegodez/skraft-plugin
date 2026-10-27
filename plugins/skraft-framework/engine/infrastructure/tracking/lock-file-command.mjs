import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { createLock, renewLock, replaceLock } from './lock-file.mjs'
import { isContained } from './review-folder.mjs'
import { createNodeFiles, writeSecret } from '../files/node-files.mjs'
import { keptKey } from '../crypto/journal-keys.mjs'

/** The exit code of a write the lock file refused: it exists, or holds another text. */
export const NOT_DONE = 3

/**
 * The lock file's writes for a host without Node's fs in process (the Claude Code mod):
 * `node lock-file-command.mjs create <path> <text>`, `replace <path> <seen> <text>`,
 * `renew <path> <seen> <text>` or `remove <path> <seen>`, each text URI-encoded; and
 * `make-key <home>`, which makes a journal key under that home folder, kept only its owner
 * reading it, and prints `{"id","key"}` on stdout: the key is on no command line; `home`, which
 * prints the user's home folder (`os.homedir()`); `contained <root>`, which exits 0 when the
 * working copy's review folder is its own (review-folder.mjs), NOT_DONE when it is not or cannot
 * be checked. Exit 0 when done, NOT_DONE when refused.
 * @param {string[]} argv @param {(text: string) => void} [out] stdout
 * @returns {Promise<number>}
 */
export const lockCommand = async ([verb, path, ...texts], out = (text) => process.stdout.write(text)) => {
  if (verb === 'make-key') return madeKey(path, out)
  if (verb === 'home') return printed(homedir(), out)
  if (verb === 'contained') return (await isContained(path).catch(() => false)) ? 0 : NOT_DONE
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
  throw new Error('usage: lock-file-command.mjs create|replace|renew|remove <path> <text>…, make-key <home>, home, contained <root>')
}

/** @param {string} home @param {(text: string) => void} out */
const madeKey = async (home, out) => printed(JSON.stringify(await keptKey(createNodeFiles(), home, writeSecret)), out)

/** @param {string} text @param {(text: string) => void} out */
const printed = (text, out) => {
  out(`${text}\n`)
  return 0
}

// Stryker disable next-line ConditionalExpression,BlockStatement: reached only when a host starts this file as a program
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await lockCommand(process.argv.slice(2))
