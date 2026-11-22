/**
 * RunDigests — the SHA-256 of a run's log, computed as its output arrives, so that no copy of the
 * whole output is kept in memory.
 *
 * @typedef {{ update: (text: string) => void, digest: () => Promise<string> }} RunDigest
 *   update: adds the UTF-8 bytes of text; digest: the lowercase hex SHA-256 of every byte added, once.
 * @typedef {{ start: () => RunDigest }} RunDigests
 */
export {}
