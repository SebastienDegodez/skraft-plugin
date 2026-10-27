import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createWebCryptoHasher } from '../../../../plugins/skraft-framework/engine/infrastructure/crypto/web-crypto-hasher.mjs'

/** RFC 4231 test case 1: a 20-byte key. */
const SHORT_KEY = '0b'.repeat(20)
const SHORT_HMAC = 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'
/** RFC 4231 test case 6: a key longer than the SHA-256 block, hashed first. */
const LONG_KEY = 'aa'.repeat(131)
const LONG_TEXT = 'Test Using Larger Than Block-Size Key - Hash Key First'
const LONG_HMAC = '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54'

/** The Claude Code mod runtime: Web Crypto with `digest`, without `importKey` or `sign`. */
const withDigestOnly = async (body) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  const { subtle } = globalThis.crypto
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { subtle: { digest: (algorithm, data) => subtle.digest(algorithm, data) }, getRandomValues: (array) => globalThis.crypto.getRandomValues(array) },
  })
  try {
    return await body()
  } finally {
    Object.defineProperty(globalThis, 'crypto', original)
  }
}

test('the HMAC-SHA-256 of a journal line matches RFC 4231 for a short and a longer-than-block key', async () => {
  const hasher = createWebCryptoHasher()
  assert.equal(await hasher.hmacSha256(SHORT_KEY, 'Hi There'), SHORT_HMAC)
  assert.equal(await hasher.hmacSha256(LONG_KEY, LONG_TEXT), LONG_HMAC)
})

test('a key of exactly one SHA-256 block is used as it is, not hashed first', async () => {
  const key = '5a'.repeat(64)
  assert.equal(await createWebCryptoHasher().hmacSha256(key, 'line'), createHmac('sha256', Buffer.from(key, 'hex')).update('line', 'utf8').digest('hex'))
})

test('a runtime whose Web Crypto only digests, as the Claude Code mod runtime, signs a journal line as Node does', async () => {
  const key = 'c3'.repeat(32)
  const line = '{"type":"run.started","slug":"checkout","keyId":"0123456789abcdef0123456789abcdef","note":"é ✓"}'
  const signed = await withDigestOnly(() => createWebCryptoHasher().hmacSha256(key, line))
  assert.equal(signed, createHmac('sha256', Buffer.from(key, 'hex')).update(line, 'utf8').digest('hex'))
})
