/**
 * What a check read, as the engine notes it while the check runs: the proof of a pre-check is the
 * log of its reads, never a list of paths guessed beforehand, because a check discovers its inputs
 * by reading them — a consistency matrix names the documents to open next (#581).
 * @typedef {{ source: 'tracking' | 'tracking-list' | 'workspace' | 'workspace-list', path: string, text: string | null }} Read
 */

/** @param {Map<string, Read>} seen @param {Read} entry */
const note = (seen, entry) => {
  seen.set(`${entry.source}\u0000${entry.path}`, entry)
  return entry.text
}

/** The tracking folder of the run, read and listed through the note. @param {Map<string, Read>} seen @param {any} files */
const notedFiles = (seen, files) => Object.freeze({
  read: async (/** @type {string} */ slug, /** @type {string} */ path) =>
    note(seen, { source: 'tracking', path, text: await files.read(slug, path) }),
  list: async (/** @type {string} */ slug, /** @type {string} */ folder) => {
    const listed = await files.list(slug, folder)
    note(seen, { source: 'tracking-list', path: folder, text: listed.join('\n') })
    return listed
  },
})

/**
 * The working copy, read and listed through the note; a path it cannot read is noted as read and
 * still throws, and a folder it cannot list is noted as listed and still answers what it answered.
 */
const notedWorkspace = (/** @type {Map<string, Read>} */ seen, /** @type {any} */ workspace) => Object.freeze({
  read: (/** @type {string} */ path) => notedRead(seen, workspace, path),
  list: (/** @type {string} */ folder) => notedList(seen, workspace, folder),
})

/** @param {Map<string, Read>} seen @param {any} workspace @param {string} path */
const notedRead = async (seen, workspace, path) => {
  try {
    return note(seen, { source: 'workspace', path, text: await workspace.read(path) })
  } catch (error) {
    note(seen, { source: 'workspace', path, text: null })
    throw error
  }
}

/** @param {Map<string, Read>} seen @param {any} workspace @param {string} folder */
const notedList = async (seen, workspace, folder) => {
  const listed = await workspace.list(folder)
  note(seen, { source: 'workspace-list', path: folder, text: listed === null ? null : listed.map(nameOf).join('\n') })
  return listed
}

/** A listed entry as the note keeps it: its name, an entry the port answers as an object included. @param {any} entry */
const nameOf = (entry) => (typeof entry === 'string' ? entry : entry.name)

/**
 * The deps a check runs through while the engine notes every read, and the log it fills. Only the
 * ports the checks read are wrapped: a check that read another would leave it unproven. Git is no
 * read of a file: what it answers of the heads and of the changed files is not in the receipt.
 * @param {any} deps @returns {{ seen: Map<string, Read>, deps: any }}
 */
export const recordingReads = (deps) => {
  const seen = new Map()
  return { seen, deps: { ...deps, files: notedFiles(seen, deps.files), workspace: notedWorkspace(seen, deps.workspace) } }
}

/**
 * The receipt of what was read: each source and path once, in a fixed order, with the hash of the
 * content it held, and no hash for a path that held nothing.
 * @param {{ hasher: import('../ports/hasher.mjs').Hasher }} deps @param {Map<string, Read>} seen
 * @returns {Promise<Array<{ source: string, path: string, hash: string | null }>>}
 */
export const receiptOf = async ({ hasher }, seen) => Promise.all([...seen.values()]
  .sort((one, other) => `${one.source}${one.path}`.localeCompare(`${other.source}${other.path}`))
  .map(async ({ source, path, text }) => ({ source, path, hash: text === null ? null : await hasher.sha256(text) })))
