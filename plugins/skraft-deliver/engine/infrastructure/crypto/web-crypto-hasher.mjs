/**
 * Hasher on Web Crypto's `subtle.digest`, which Node and the Claude Code mod runtime both
 * expose on the global `crypto`: no import, so the mod can load it. The mod runtime has no
 * `subtle.importKey` nor `subtle.sign` (measured under `claude plugin test`, Claude Code
 * 2.1.291), so HMAC-SHA-256 is built on the digest, as RFC 2104 writes it.
 * @returns {import('../../application/ports/hasher.mjs').Hasher}
 */
export const createWebCryptoHasher = () => Object.freeze({
  sha256: async (text) => hex(await digest(utf8(text))),
  hmacSha256: async (key, text) => hex(await hmac(bytesOf(key), utf8(text))),
})

/** SHA-256's block size, in bytes. */
const BLOCK = 64

/**
 * HMAC-SHA-256 of message under key: H((K ^ opad) || H((K ^ ipad) || message)).
 * @param {Uint8Array} key @param {Uint8Array} message
 */
const hmac = async (key, message) => {
  const block = await blockKey(key)
  const inner = await digest(joined(padded(block, 0x36), message))
  return digest(joined(padded(block, 0x5c), new Uint8Array(inner)))
}

/** The key as one block: hashed first when longer, zeros after it. @param {Uint8Array} key */
const blockKey = async (key) => {
  const block = new Uint8Array(BLOCK)
  block.set(key.length > BLOCK ? new Uint8Array(await digest(key)) : key)
  return block
}

/** @param {Uint8Array} block @param {number} pad */
const padded = (block, pad) => block.map((byte) => byte ^ pad)

/** @param {Uint8Array} first @param {Uint8Array} second */
const joined = (first, second) => {
  const both = new Uint8Array(first.length + second.length)
  both.set(first)
  both.set(second, first.length)
  return both
}

/** @param {Uint8Array} bytes @returns {Promise<ArrayBuffer>} */
const digest = (bytes) => globalThis.crypto.subtle.digest('SHA-256', bytes)

/** @param {string} text */
const utf8 = (text) => new TextEncoder().encode(text)

/** @param {string} key lowercase hex */
const bytesOf = (key) => new Uint8Array((key.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16)))

/** @param {ArrayBuffer} buffer */
const hex = (buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
