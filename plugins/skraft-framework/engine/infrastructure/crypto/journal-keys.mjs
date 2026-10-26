/**
 * JournalKeys in the developer's home folder, `<home>/.skraft/journal-keys/<id>.key`, on any
 * host's FileFunctions; the random bytes come from the Web Crypto that Node and the Claude Code
 * mod runtime both expose.
 * @param {{ files: import('../tracking/tracking-store.mjs').FileFunctions, home: () => Promise<string | null> }} options
 *   home: the home folder, null when the host cannot name one
 * @returns {import('../../application/ports/journal-keys.mjs').JournalKeys}
 */
export const createJournalKeys = ({ files, home }) => Object.freeze({
  create: () => createKey(files, home),
  read: async (id) => {
    const folder = await home()
    return folder === null ? null : trimmed(await files.read(keyPath(files, folder, id)))
  },
})

/** @param {import('../tracking/tracking-store.mjs').FileFunctions} files @param {() => Promise<string | null>} home */
const createKey = async (files, home) => {
  const folder = await home()
  if (folder === null) throw new Error('no home folder to keep the journal key in (HOME or USERPROFILE)')
  const created = { id: randomHex(16), key: randomHex(32) }
  await files.write(keyPath(files, folder, created.id), `${created.key}\n`)
  return created
}

/** @param {import('../tracking/tracking-store.mjs').FileFunctions} files @param {string} home @param {string} id */
const keyPath = (files, home, id) => files.join(home, '.skraft', 'journal-keys', `${id}.key`)

/** @param {string | null} text */
const trimmed = (text) => (text === null ? null : text.trim())

/** @param {number} bytes */
const randomHex = (bytes) => [...globalThis.crypto.getRandomValues(new Uint8Array(bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
