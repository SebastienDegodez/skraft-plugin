/**
 * Hasher on Web Crypto, which Node and the Claude Code mod runtime both expose as the
 * global `crypto`: no import, so the mod can load it.
 * @returns {import('../../application/ports/hasher.mjs').Hasher}
 */
export const createWebCryptoHasher = () => Object.freeze({
  sha256: async (text) => {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  },
})
