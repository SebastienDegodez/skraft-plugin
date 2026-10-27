import { TRACKING_FOLDER } from '../../infrastructure/tracking/tracking-store.mjs'
import { joinPath } from './mod-files.mjs'
import { holdsTrackedVia } from '../../infrastructure/tracking/tracked-aliases.mjs'

/**
 * The RunLock of the Claude Code mod: `$.fs` reads the lock file, but has no exclusive create,
 * rename or remove; each write runs the engine's lock-file command under Node, the same writes
 * a Node host makes, so a mod session and a Copilot session exclude each other.
 * @param {{
 *   files: import('../../infrastructure/tracking/tracking-store.mjs').FileFunctions,
 *   run: import('./mod-processes.mjs').ModRun, pluginRoot: string, root: string, owner?: string, folder?: string[],
 * }} options run: `$.process.run`; root: the working copy; folder: the tracking folder the leases
 *   sit in, `.copilot-tracking/skraft-plans` by default
 * @returns {import('../../application/ports/run-lock.mjs').RunLock}
 */
export const createModRunLock = ({ files, run, pluginRoot, root, owner = randomOwner(), folder = TRACKING_FOLDER }) => {
  const host = { run, pluginRoot }
  const lockAt = (/** @type {string} */ slug) => joinPath(root, ...folder, slug, '.lock')
  return Object.freeze({
    owner,
    read: (slug) => files.read(lockAt(slug)),
    create: (slug, text) => lockCommand(host, ['create', lockAt(slug), encodeURIComponent(text)]),
    replace: (slug, seen, text) => lockCommand(host, replaceArgs(lockAt(slug), seen, text)),
    renew: (slug, seen, text) => lockCommand(host, ['renew', lockAt(slug), encodeURIComponent(seen), encodeURIComponent(text)]),
  })
}

/**
 * Has node make and keep a journal key the way a Node host does, only its owner reading it
 * (0600 in 0700 folders on POSIX), exclusively; the key comes back on stdout, never on a
 * command line, which other users of the machine can list.
 * @param {{ run: import('./mod-processes.mjs').ModRun, pluginRoot: string }} host
 * @returns {import('../../infrastructure/crypto/journal-keys.mjs').KeyMaker}
 */
export const modMakeKey = (host) => async (home) => {
  const result = await commandRun(host, ['make-key', home])
  if (result.exitCode !== 0) throw new Error(`skraft's lock-file command failed (node exited ${result.exitCode})`)
  const { id, key } = JSON.parse(result.stdout)
  return { id, key }
}

/**
 * The ReviewFolder of the Claude Code mod: `$.fs` cannot tell a link from a folder, nor which
 * file a name opens, so node checks both the way a Node host does; a check that fails or does not
 * finish is a folder not contained, and review state held.
 * @param {{ run: import('./mod-processes.mjs').ModRun, pluginRoot: string, root: string }} host root: the working copy
 * @returns {import('../../application/ports/review-folder.mjs').ReviewFolder}
 */
export const createModReviewFolder = ({ run, pluginRoot, root }) => Object.freeze({
  contained: async () => (await commandRun({ run, pluginRoot }, ['contained', root]).catch(() => null))?.exitCode === 0,
  holdsTracked: (paths) => holdsTrackedVia((folder, names) => modSameAs({ run, pluginRoot }, root, folder, names), paths).catch(() => true),
})

/**
 * The names node finds open as the same file as the folder, within the lock-file time limit.
 * @param {{ run: import('./mod-processes.mjs').ModRun, pluginRoot: string }} host @param {string} root
 * @param {string} folder @param {string[]} names
 * @returns {Promise<string[]>}
 */
const modSameAs = async (host, root, folder, names) => {
  const result = await commandRun(host, ['same-as', root, folder, ...names.map(encodeURIComponent)])
  if (result.exitCode !== 0) throw new Error(`skraft's lock-file command failed (node exited ${result.exitCode})`)
  return JSON.parse(result.stdout)
}

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
const lockCommand = async (host, args) => {
  const result = await commandRun(host, args)
  if (result.exitCode === 0) return true
  if (result.exitCode === NOT_DONE) return false
  throw new Error(`skraft's lock-file command failed (node exited ${result.exitCode})`)
}

/**
 * The engine's lock-file command under node, within its time limit.
 * @param {{ run: import('./mod-processes.mjs').ModRun, pluginRoot: string }} host @param {string[]} args
 */
const commandRun = ({ run, pluginRoot }, args) =>
  run(['node', joinPath(pluginRoot, 'engine', 'infrastructure', 'tracking', 'lock-file-command.mjs'), ...args], { timeoutMs: LOCK_TIMEOUT_MS })

/** 16 random bytes in hex, from the Web Crypto the mod runtime exposes. */
const randomOwner = () => [...globalThis.crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
