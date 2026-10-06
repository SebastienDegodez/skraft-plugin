// Hasher (ports/infrastructure/hasher.mjs) on the Web Crypto API, the same in Node and in
// the Claude Code mod runtime (which has crypto.subtle and no Node API).
const toHex = (buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

export const createWebCryptoHasher = () => Object.freeze({
  sha256: async (text) => toHex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)))),
})
