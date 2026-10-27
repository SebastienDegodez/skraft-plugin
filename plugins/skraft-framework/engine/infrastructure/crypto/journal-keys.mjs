/**
 * JournalKeys in the developer's home folder, `<home>/.skraft/journal-keys/<id>.key`, on any
 * host's FileFunctions; the random bytes come from the Web Crypto that Node and the Claude Code
 * mod runtime both expose.
 * @typedef {(home: string) => Promise<{ id: string, key: string }>} KeyMaker
 *   makes and keeps a new key under that home folder
 * @param {{ files: import('../tracking/tracking-store.mjs').FileFunctions, home: () => Promise<string | null>, writeSecret?: (path: string, text: string) => Promise<void>, makeKey?: KeyMaker }} options
 *   home: the home folder, null when the host cannot name one; writeSecret: writes a key file
 *   only its owner reads, where the host can (Node on POSIX), `files.write` by default; makeKey:
 *   how a new key is made and kept, here with writeSecret by default (the mod has a child
 *   process make it, so that the key is on no command line)
 * @returns {import('../../application/ports/journal-keys.mjs').JournalKeys}
 */
export const createJournalKeys = ({ files, home, writeSecret = files.write, makeKey = (folder) => keptKey(files, folder, writeSecret) }) => Object.freeze({
  create: () => createKey(home, makeKey),
  read: async (id) => {
    const folder = await home()
    return folder === null ? null : trimmed(await files.read(keyPath(files, folder, id)))
  },
  available: async () => (await home()) !== null,
})

/** @param {() => Promise<string | null>} home @param {KeyMaker} makeKey */
const createKey = async (home, makeKey) => {
  const folder = await home()
  if (folder === null) throw new Error('no home folder to keep the journal key in (HOME or USERPROFILE)')
  return makeKey(folder)
}

/**
 * A new random key, kept in its file under the home folder.
 * @param {import('../tracking/tracking-store.mjs').FileFunctions} files @param {string} folder
 * @param {(path: string, text: string) => Promise<void>} writeSecret
 */
export const keptKey = async (files, folder, writeSecret) => {
  const created = { id: randomHex(16), key: randomHex(32) }
  await writeSecret(keyPath(files, folder, created.id), `${created.key}\n`)
  return created
}

/** @param {import('../tracking/tracking-store.mjs').FileFunctions} files @param {string} home @param {string} id */
const keyPath = (files, home, id) => files.join(home, '.skraft', 'journal-keys', `${id}.key`)

/** @param {string | null} text */
const trimmed = (text) => (text === null ? null : text.trim())

/** @param {number} bytes */
const randomHex = (bytes) => [...globalThis.crypto.getRandomValues(new Uint8Array(bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
