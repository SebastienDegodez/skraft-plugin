/**
 * What a stream writes, bounded: within the limit it is kept whole; past it, its first and last
 * halves are kept around a fixed marker, each cut on a UTF-8 character boundary. Memory stays
 * within the limit whatever the stream writes.
 */

export const CUT_MARKER = '\n… output cut …\n'

/**
 * @param {number} limit bytes kept at most
 * @returns {{ push: (chunk: Buffer) => void, text: () => string }}
 */
export const createOutput = (limit) => {
  const kept = { head: Buffer.alloc(0), tail: Buffer.alloc(0), cut: false, half: Math.floor(limit / 2), limit }
  return Object.freeze({ push: (chunk) => push(kept, chunk), text: () => text(kept) })
}

/**
 * @typedef {{ head: Buffer, tail: Buffer, cut: boolean, half: number, limit: number }} Kept
 *   head: everything until the limit, then its first half; tail: the last half past it.
 */

/** @param {Kept} kept @param {Buffer} chunk */
const push = (kept, chunk) => {
  if (!kept.cut && kept.head.length + chunk.length <= kept.limit) {
    kept.head = Buffer.concat([kept.head, chunk])
    return
  }
  const all = kept.cut ? Buffer.concat([kept.tail, chunk]) : Buffer.concat([kept.head, chunk])
  if (!kept.cut) kept.head = all.subarray(0, kept.half)
  kept.tail = all.subarray(all.length - kept.half)
  kept.cut = true
}

/** @param {Kept} kept @returns {string} */
const text = ({ head, tail, cut }) => {
  if (!cut) return head.toString('utf8')
  return `${wholeHead(head).toString('utf8')}${CUT_MARKER}${wholeTail(tail).toString('utf8')}`
}

/** The head without a character its cut split. @param {Buffer} bytes @returns {Buffer} */
const wholeHead = (bytes) => {
  let start = bytes.length - 1
  while (start > 0 && isContinuation(bytes[start])) start -= 1
  return bytes.length - start < lengthOf(bytes[start]) ? bytes.subarray(0, start) : bytes
}

/** The tail without the continuation bytes of a character its cut split. @param {Buffer} bytes @returns {Buffer} */
const wholeTail = (bytes) => {
  let start = 0
  while (start < bytes.length && isContinuation(bytes[start])) start += 1
  return bytes.subarray(start)
}

/** @param {number} byte */
const isContinuation = (byte) => (byte & 0xc0) === 0x80

/** How many bytes the character a lead byte starts takes. @param {number} lead */
const lengthOf = (lead) => {
  if (lead >= 0xf0) return 4
  if (lead >= 0xe0) return 3
  return lead >= 0xc0 ? 2 : 1
}
