/**
 * What a kernel prints, bounded per window (one cell, or the time between two cells): its first
 * 512 KiB go to the server as they are printed; past them only the last 512 KiB are kept, and
 * they go, after a fixed marker, when the window closes. Neither the kernel nor the server ever
 * holds more of one window than that.
 *
 * @typedef {{ cell: number | null, sent: number, tail: Buffer[], kept: number, over: number, cut: boolean }} Window
 *   sent: bytes sent as printed; tail, kept: the last chunks past them, and their size; over: bytes printed past them; cut: some of those were dropped.
 */

export const PRINT_HALF_BYTES = 524_288
export const PRINT_MARKER = '\n… the cell printed more than 1 MiB: its first and last 512 KiB are kept …\n'

/**
 * @param {(cell: number | null, text: string) => void} send
 * @returns {{ write: (cell: number | null, chunk: Buffer) => void, close: () => void }}
 */
export const createPrintWindow = (send) => {
  /** @type {{ window: Window }} */
  const state = { window: open(null) }
  return Object.freeze({
    write: (cell, chunk) => write(state, send, { cell, chunk }),
    close: () => { flush(state.window, send); state.window = open(state.window.cell) },
  })
}

/** @param {number | null} cell @returns {Window} */
const open = (cell) => ({ cell, sent: 0, tail: [], kept: 0, over: 0, cut: false })

/** @param {{ window: Window }} state @param {(cell: number | null, text: string) => void} send @param {{ cell: number | null, chunk: Buffer }} printed */
const write = (state, send, { cell, chunk }) => {
  if (state.window.cell !== cell) {
    flush(state.window, send)
    state.window = open(cell)
  }
  const window = state.window
  const room = Math.max(PRINT_HALF_BYTES - window.sent, 0)
  if (room > 0) sendHead(window, send, chunk.subarray(0, room))
  if (chunk.length > room) keepTail(window, chunk.subarray(room))
}

/** @param {Window} window @param {(cell: number | null, text: string) => void} send @param {Buffer} head */
const sendHead = (window, send, head) => {
  window.sent += head.length
  send(window.cell, head.toString('utf8'))
}

/** @param {Window} window @param {Buffer} rest */
const keepTail = (window, rest) => {
  window.tail.push(rest)
  window.kept += rest.length
  window.over += rest.length
  while (window.kept - window.tail[0].length >= PRINT_HALF_BYTES) window.kept -= /** @type {Buffer} */ (window.tail.shift()).length
  window.cut = window.over > PRINT_HALF_BYTES
}

/** The tail of a window that passed its first half, after the marker. @param {Window} window @param {(cell: number | null, text: string) => void} send */
const flush = (window, send) => {
  if (window.tail.length === 0) return
  const all = Buffer.concat(window.tail)
  const tail = all.subarray(Math.max(all.length - PRINT_HALF_BYTES, 0))
  send(window.cell, `${window.cut ? PRINT_MARKER : ''}${wholeTail(tail).toString('utf8')}`)
  Object.assign(window, { tail: [], kept: 0 })
}

/** The tail without the continuation bytes of a character its cut split. @param {Buffer} bytes */
const wholeTail = (bytes) => {
  let start = 0
  while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) start += 1
  return bytes.subarray(start)
}
