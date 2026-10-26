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

/**
 * Writes a journal key the way a Node host does, only its owner reading it (0600 in 0700
 * folders on POSIX), exclusively: `$.fs` sets no mode and creates nothing exclusively.
 * @param {{ run: import('./mod-processes.mjs').ModRun, pluginRoot: string }} host
 * @returns {(path: string, text: string) => Promise<void>}
 */
export const modWriteSecret = (host) => async (path, text) => {
  if (!(await lockCommand(host, ['write-secret', path, encodeURIComponent(text)]))) throw new Error('a journal key of that id already exists')
}

/** @param {string} root @param {string} slug */
const lockAt = (root, slug) => joinPath(root, ...TRACKING_FOLDER, slug, '.lock')

/** @param {string} path @param {string} seen @param {string | null} text */
const replaceArgs = (path, seen, text) =>
  (text === null ? ['remove', path, encodeURIComponent(seen)] : ['replace', path, encodeURIComponent(seen), encodeURIComponent(text)])

/** Exit 0: done; 3: the lock file refused the write (lock-file-command.mjs NOT_DONE). */
const NOT_DONE = 3
/** A lock write is a few file calls; one still running after this is stopped by `$.process.run`. */
const LOCK_TIMEOUT_MS = 20_000

/**
 * @param {{ run: import('./mod-processes.mjs').ModRun, pluginRoot: string }} host @param {string[]} args
 * @returns {Promise<boolean>}
 */
const lockCommand = async ({ run, pluginRoot }, args) => {
  const result = await run(['node', joinPath(pluginRoot, 'engine', 'infrastructure', 'tracking', 'lock-file-command.mjs'), ...args], { timeoutMs: LOCK_TIMEOUT_MS })
  if (result.exitCode === 0) return true
  if (result.exitCode === NOT_DONE) return false
  throw new Error(`skraft's lock-file command failed (node exited ${result.exitCode})`)
}

/** 16 random bytes in hex, from the Web Crypto the mod runtime exposes. */
const randomOwner = () => [...globalThis.crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
