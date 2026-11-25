import { createHash } from 'node:crypto'

/**
 * SHA-256 digests on Node's crypto, fed as a run's output arrives.
 * @returns {import('../../application/ports/run-digests.mjs').RunDigests}
 */
export const createRunDigests = () => Object.freeze({ start })

const start = () => {
  const hash = createHash('sha256')
  return Object.freeze({
    update: (/** @type {string} */ text) => { hash.update(text, 'utf8') },
    digest: async () => hash.digest('hex'),
  })
}
