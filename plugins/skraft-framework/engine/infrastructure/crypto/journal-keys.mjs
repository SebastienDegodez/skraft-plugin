/**
 * JournalKeys in the developer's home folder, `<home>/.skraft/journal-keys/<id>.key`, on any
 * host's FileFunctions; the random bytes come from the Web Crypto that Node and the Claude Code
 * mod runtime both expose.
 * @param {{ files: import('../tracking/tracking-store.mjs').FileFunctions, home: () => Promise<string | null>, writeSecret?: (path: string, text: string) => Promise<void> }} options
 *   home: the home folder, null when the host cannot name one; writeSecret: writes a key file
 *   only its owner reads, where the host can (Node on POSIX); `files.write` by default
 * @returns {import('../../application/ports/journal-keys.mjs').JournalKeys}
 */
export const createJournalKeys = ({ files, home, writeSecret = files.write }) => Object.freeze({
  create: () => createKey(files, home, writeSecret),
  read: async (id) => {
    const folder = await home()
    return folder === null ? null : trimmed(await files.read(keyPath(files, folder, id)))
  },
})

/**
 * @param {import('../tracking/tracking-store.mjs').FileFunctions} files @param {() => Promise<string | null>} home
 * @param {(path: string, text: string) => Promise<void>} writeSecret
 */
const createKey = async (files, home, writeSecret) => {
  const folder = await home()
  if (folder === null) throw new Error('no home folder to keep the journal key in (HOME or USERPROFILE)')
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
