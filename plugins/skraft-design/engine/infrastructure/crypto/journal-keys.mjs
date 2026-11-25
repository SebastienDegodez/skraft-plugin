/**
 * JournalKeys in the developer's home folder, `<home>/.skraft-design/journal-keys/<id>.key`, on any
 * host's FileFunctions; the random bytes come from the Web Crypto that Node and the Claude Code
 * mod runtime both expose.
 * @typedef {(home: string) => Promise<{ id: string, key: string }>} KeyMaker
 *   makes and keeps a new key under that home folder
 * @param {{ files: import('../tracking/tracking-store.mjs').FileFunctions, home: () => Promise<string | null>, writeSecret?: (path: string, text: string) => Promise<void>, makeKey?: KeyMaker }} options
 *   home: the home folder, null when the host cannot name one; writeSecret: writes a key file
 *   only its owner reads, where the host can (Node on POSIX), `files.write` by default; makeKey:
 *   how a new key is made and kept, here with writeSecret by default (the mod has a child
 *   process make it, so that the key is on no command line); fixedKey: the repository's key a CI run
 *   signs with in place of a new one, from the secret its workflow provides, null without one
 * @returns {import('../../application/ports/journal-keys.mjs').JournalKeys}
 */
export const createJournalKeys = ({ files, home, writeSecret = files.write, makeKey = (folder) => keptKey(files, folder, writeSecret), fixedKey = null }) => Object.freeze({
  create: () => (fixedKey === null ? createKey(home, makeKey) : repositoryKey(fixedKey)),
  read: async (id) => {
    if (fixedKey !== null && id === REPOSITORY_KEY_ID) return fixedKey.trim().toLowerCase()
    const folder = await home()
    return folder === null ? null : trimmed(await files.read(keyPath(files, folder, id)))
  },
  available: async () => fixedKey !== null || (await home()) !== null,
})

/**
 * The id a journal signed with the repository's key names: every runner of a CI run that holds the
 * secret reads the same key under it, though no runner keeps its HOME (#662).
 */
export const REPOSITORY_KEY_ID = 'repository-secret'

/** @param {string} secret */
const repositoryKey = async (secret) => {
  if (!/^[0-9a-f]{64}$/i.test(secret.trim())) throw new Error('SKRAFT_DESIGN_JOURNAL_KEY must be 64 hexadecimal characters')
  return { id: REPOSITORY_KEY_ID, key: secret.trim().toLowerCase() }
}

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
const keyPath = (files, home, id) => files.join(home, '.skraft-design', 'journal-keys', `${id}.key`)

/** @param {string | null} text */
const trimmed = (text) => (text === null ? null : text.trim())

/** @param {number} bytes */
const randomHex = (bytes) => [...globalThis.crypto.getRandomValues(new Uint8Array(bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
