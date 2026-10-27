/**
 * Hasher on Web Crypto's `digest`, which Node and the Claude Code mod runtime both expose on
 * the global `crypto`: no import, so the mod can load it. The mod runtime has no `importKey`
 * nor `sign`, so the HMAC is RFC 2104 over SHA-256 digests.
 * @returns {import('../../application/ports/hasher.mjs').Hasher}
 */
export const createWebCryptoHasher = () => Object.freeze({
  sha256: async (text) => hex(await digest(utf8(text))),
  hmacSha256: async (key, text) => hex(await hmac(await blockKey(bytesOf(key)), utf8(text))),
})

/** The SHA-256 block, in bytes. */
const BLOCK = 64

/** @param {Uint8Array} bytes @returns {Promise<Uint8Array>} */
const digest = async (bytes) => new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))

/** The key padded with zeros to one block, hashed first when longer. @param {Uint8Array} key */
const blockKey = async (key) => {
  const padded = new Uint8Array(BLOCK)
  padded.set(key.length > BLOCK ? await digest(key) : key)
  return padded
}

/** H((K ⊕ opad) ‖ H((K ⊕ ipad) ‖ text)). @param {Uint8Array} key one block @param {Uint8Array} text */
const hmac = async (key, text) => digest(concat(xor(key, 0x5c), await digest(concat(xor(key, 0x36), text))))

/** @param {Uint8Array} key @param {number} pad */
const xor = (key, pad) => key.map((byte) => byte ^ pad)

/** @param {Uint8Array} first @param {Uint8Array} second */
const concat = (first, second) => {
  const joined = new Uint8Array(first.length + second.length)
  joined.set(first)
  joined.set(second, first.length)
  return joined
}

/** @param {string} text */
const utf8 = (text) => new TextEncoder().encode(text)

/** @param {string} key lowercase hex */
const bytesOf = (key) => new Uint8Array((key.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16)))

/** @param {Uint8Array} bytes */
const hex = (bytes) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
