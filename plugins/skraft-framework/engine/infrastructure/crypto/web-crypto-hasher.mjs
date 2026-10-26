/**
 * Hasher on Web Crypto, which Node and the Claude Code mod runtime both expose as the
 * global `crypto`: no import, so the mod can load it.
 * @returns {import('../../application/ports/hasher.mjs').Hasher}
 */
export const createWebCryptoHasher = () => {
  /** @type {Map<string, Promise<CryptoKey>>} each key imported once */
  const keys = new Map()
  return Object.freeze({
    sha256: async (text) => hex(await globalThis.crypto.subtle.digest('SHA-256', utf8(text))),
    hmacSha256: async (key, text) => hex(await globalThis.crypto.subtle.sign('HMAC', await imported(keys, key), utf8(text))),
  })
}

/** @param {Map<string, Promise<CryptoKey>>} keys @param {string} key lowercase hex */
const imported = (keys, key) => {
  if (!keys.has(key)) keys.set(key, globalThis.crypto.subtle.importKey('raw', bytesOf(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']))
  return /** @type {Promise<CryptoKey>} */ (keys.get(key))
}

/** @param {string} text */
const utf8 = (text) => new TextEncoder().encode(text)

/** @param {string} key lowercase hex */
const bytesOf = (key) => new Uint8Array((key.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16)))

/** @param {ArrayBuffer} buffer */
const hex = (buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
