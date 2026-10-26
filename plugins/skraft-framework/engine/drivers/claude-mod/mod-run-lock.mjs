import { TRACKING_FOLDER } from '../../infrastructure/tracking/tracking-store.mjs'
import { joinPath } from './mod-files.mjs'

/**
 * The RunLock of the Claude Code mod: `$.fs` reads the lock file, but has no exclusive create,
 * rename or remove; each write runs the engine's lock-file command under Node, the same writes
 * a Node host makes, so a mod session and a Copilot session exclude each other.
 * @param {{
 *   files: import('../../infrastructure/tracking/tracking-store.mjs').FileFunctions,
 *   run: import('./mod-processes.mjs').ModRun, pluginRoot: string, root: string, owner?: string,
 * }} options run: `$.process.run`; root: the working copy
 * @returns {import('../../application/ports/run-lock.mjs').RunLock}
 */
export const createModRunLock = ({ files, run, pluginRoot, root, owner = randomOwner() }) => {
  const host = { run, pluginRoot }
  return Object.freeze({
    owner,
    read: (slug) => files.read(lockAt(root, slug)),
    create: (slug, text) => lockCommand(host, ['create', lockAt(root, slug), encodeURIComponent(text)]),
    replace: (slug, seen, text) => lockCommand(host, replaceArgs(lockAt(root, slug), seen, text)),
    renew: (slug, seen, text) => lockCommand(host, ['renew', lockAt(root, slug), encodeURIComponent(seen), encodeURIComponent(text)]),
  })
}

/** @param {string} root @param {string} slug */
const lockAt = (root, slug) => joinPath(root, ...TRACKING_FOLDER, slug, '.lock')

/** @param {string} path @param {string} seen @param {string | null} text */
const replaceArgs = (path, seen, text) =>
  (text === null ? ['remove', path, encodeURIComponent(seen)] : ['replace', path, encodeURIComponent(seen), encodeURIComponent(text)])

/** Exit 0: done; 3: the lock file refused the write (lock-file-command.mjs NOT_DONE). */
const NOT_DONE = 3

/**
 * @param {{ run: import('./mod-processes.mjs').ModRun, pluginRoot: string }} host @param {string[]} args
 * @returns {Promise<boolean>}
 */
const lockCommand = async ({ run, pluginRoot }, args) => {
  const result = await run(['node', joinPath(pluginRoot, 'engine', 'infrastructure', 'tracking', 'lock-file-command.mjs'), ...args])
  if (result.exitCode === 0) return true
  if (result.exitCode === NOT_DONE) return false
  throw new Error(`the pipeline's lock file could not be written (node exited ${result.exitCode})`)
}

/** 16 random bytes in hex, from the Web Crypto the mod runtime exposes. */
const randomOwner = () => [...globalThis.crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
