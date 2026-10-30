// The skraft-pipeline canvas on a simulated Copilot canvas host: createCanvas keeps the options
// it is given, as the SDK keeps the handlers, and the test calls open, the action and onClose as
// the host would. Requests reach the panel's real loopback server.
import { request as httpRequest } from 'node:http'
import { connect } from 'node:net'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { createPipelineCanvas } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/pipeline-canvas.mjs'
import { PLUGIN_ROOT } from '../support/workspace.mjs'

/** The SDK's CanvasError: a code and a message. */
export class CanvasError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/**
 * How long a canvas test may run: an end for a test that waits on what never comes, far past what
 * a loaded machine takes (a test runs up to six pipelines to their ADR). A test the time ends is
 * cancelled, its hooks run and its signal aborts, which closes its panels, its streams and the
 * requests given that signal, so that its process ends.
 */
export const BOUNDED = Object.freeze({ timeout: 300_000 })

/**
 * A canvas of a session whose directory is what `directory()` says, each instance it opened
 * closed after the test, and again once its signal aborts: a hook before this one that throws
 * skips this one, and an open panel would keep the test's process alive.
 * @param {import('node:test').TestContext} t @param {{ directory: () => string | null, home: string, more?: object }} host
 */
export const pipelineCanvas = (t, { directory, home, more = {} }) => {
  const canvas = /** @type {any} */ (createPipelineCanvas({ createCanvas: (options) => options, CanvasError, directory, pluginRoot: PLUGIN_ROOT, home, pollMs: 20, ...more }))
  const opened = new Set()
  const closeAll = () => Promise.allSettled([...opened].map((instanceId) => canvas.onClose({ instanceId })))
  t.after(closeAll)
  t.signal.addEventListener('abort', () => void closeAll(), { once: true })
  return {
    canvas,
    /** @param {string} [instanceId] @param {...unknown} input none: an empty input */
    open: (instanceId = 'panel-1', ...input) => {
      opened.add(instanceId)
      return canvas.open({ instanceId, input: input.length === 0 ? {} : input[0] })
    },
    /** @param {...unknown} input none: an empty input */
    shown: (...input) => canvas.actions[0].handler({ instanceId: 'panel-1', actionName: 'get_pipeline', input: input.length === 0 ? {} : input[0] }),
  }
}

/**
 * One HTTP request to the panel, with the headers given as they are (Host included). A body given
 * in parts is sent one part at a time, a moment apart, so that the server reads each on its own.
 * An event stream, or any answer when `stream` is set, is answered with its status and headers
 * alone, and closed. A request to a port no panel listens on any more passes `signal`: another
 * process may listen on it by then and never answer, and the request ends with the test.
 * @param {string} url @param {{ method?: string, headers?: Record<string, string>, body?: string | string[], stream?: boolean, signal?: AbortSignal }} [options]
 * @returns {Promise<{ status: number, headers: import('node:http').IncomingHttpHeaders, text: string }>}
 */
export const request = (url, { method = 'GET', headers = {}, body, stream = false, signal } = {}) => new Promise((done, fail) => {
  const sent = httpRequest(url, { method, headers, signal }, (res) => {
    if (stream || res.headers['content-type'] === 'text/event-stream') {
      done({ status: res.statusCode ?? 0, headers: res.headers, text: '' })
      return sent.destroy()
    }
    let text = ''
    res.setEncoding('utf8')
    res.on('data', (chunk) => { text += chunk })
    res.on('end', () => done({ status: res.statusCode ?? 0, headers: res.headers, text }))
  })
  sent.on('error', fail)
  void sendParts(sent, typeof body === 'string' || body === undefined ? [body] : body)
})

/** @param {import('node:http').ClientRequest} sent @param {Array<string | undefined>} parts */
const sendParts = async (sent, parts) => {
  for (const part of parts.slice(0, -1)) {
    sent.write(part)
    await new Promise((done) => setTimeout(done, 50))
  }
  sent.end(parts.at(-1))
}

/** The token the url `open` gives carries, as the page reads it from its own address. @param {string} url */
export const tokenOf = async (url) => /** @type {string} */ (new URL(url).searchParams.get('t'))

/**
 * Waits for `promise` at most `ms` (or until the test aborts): its outcome, else 'still waiting'.
 * The timer does not keep the process alive.
 * @template T
 * @param {import('node:test').TestContext} t @param {number} ms @param {Promise<T>} promise
 * @returns {Promise<T | string>}
 */
export const within = (t, ms, promise) => Promise.race([promise, delay(ms, 'still waiting', { ref: false, signal: t.signal }).catch(() => 'still waiting')])

/**
 * A raw TCP connection to the panel's server, for what an HTTP client cannot do (send nothing, a
 * request cut short). `closed` resolves 'closed' once the server dropped it. The socket is
 * destroyed after the test and when its signal aborts: a live one would keep the process alive.
 * @param {import('node:test').TestContext} t @param {string} url
 */
export const rawConnection = async (t, url) => {
  const socket = connect(Number(new URL(url).port), '127.0.0.1')
  socket.setEncoding('utf8')
  let text = ''
  socket.on('data', (chunk) => { text += chunk })
  socket.on('error', () => undefined)
  const closed = once(socket, 'close').then(() => 'closed', () => 'closed')
  t.after(() => socket.destroy())
  t.signal.addEventListener('abort', () => socket.destroy(), { once: true })
  await within(t, 10_000, once(socket, 'connect'))
  return { socket, received: () => text, closed }
}

/**
 * Opens `instanceId` once the server has seen a page leave: a panel whose page closed a moment ago
 * still counts as listened to, and an open refused for that reason has no effect, so it is tried
 * again a little later. Any other refusal is thrown.
 * @param {import('node:test').TestContext} t @param {(instanceId: string) => Promise<any>} open @param {string} instanceId
 */
export const pageLeft = async (t, open, instanceId) => {
  for (;;) {
    try {
      return await open(instanceId)
    } catch (error) {
      if (/** @type {any} */ (error).code !== 'skraft_too_many_canvases' || t.signal.aborted) throw error
      await delay(25, undefined, { signal: t.signal })
    }
  }
}

/**
 * The panel's content stream, read as a page reads it. Every block it sends is a frame, in order:
 * `{ comment: 'ping' }` for a comment line, else the fields it names (`retry`, `event`, `data`).
 * `next(until)` waits for the first content (a block with data and no event, parsed) `until`
 * accepts, among those not read yet, until the test ends. `frame(until, ms)` reads the frames not
 * read yet from its own cursor and gives the first `until` accepts, or null once `ms` passed or
 * the test aborted. The stream closes after the test, and once its signal aborts.
 * @param {import('node:test').TestContext} t @param {string} url @param {string} token
 */
export const contentStream = (t, url, token) => {
  const received = []
  const frames = []
  const waiting = []
  const sent = httpRequest(new URL(`/events?token=${token}`, url), (res) => {
    let buffer = ''
    res.setEncoding('utf8')
    res.on('data', (chunk) => {
      buffer += chunk
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? ''
      for (const block of blocks) accept(block)
      for (const wake of waiting.splice(0)) wake()
    })
  })
  /** @param {string} block */
  const accept = (block) => {
    const frame = frameOf(block)
    frames.push(frame)
    if (frame.data !== undefined && frame.event === undefined) received.push(JSON.parse(frame.data))
  }
  sent.on('error', () => undefined)
  sent.end()
  t.after(() => sent.destroy())
  t.signal.addEventListener('abort', () => sent.destroy(), { once: true })
  /** The page leaves; resolves once its connection is closed, at once when it already is. @returns {Promise<void>} */
  const close = () => new Promise((done) => {
    if (sent.closed) return done()
    sent.once('close', () => done())
    sent.destroy()
  })
  let read = 0
  /** @param {(content: any) => boolean} [until] @returns {Promise<any>} */
  const next = async (until = () => true) => {
    for (;;) {
      while (read < received.length) {
        const content = received[read++]
        if (until(content)) return content
      }
      if (t.signal.aborted) throw new Error('the test ended before the content came')
      await new Promise((wake) => { waiting.push(wake); setTimeout(wake, 100) })
    }
  }
  let seen = 0
  /** @param {(frame: Record<string, string>) => boolean} until @param {number} [ms] @returns {Promise<Record<string, string> | null>} */
  const frame = async (until, ms = 10_000) => {
    const deadline = Date.now() + ms
    for (;;) {
      while (seen < frames.length) {
        const found = frames[seen++]
        if (until(found)) return found
      }
      if (t.signal.aborted || Date.now() > deadline) return null
      await new Promise((wake) => { waiting.push(wake); setTimeout(wake, 25) })
    }
  }
  return { next, frame, frames, received, close }
}

/** One stream block as a frame: a comment line is `{ comment }`, any other line a field. @param {string} block */
const frameOf = (block) => {
  const frame = /** @type {Record<string, string>} */ ({})
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) frame.comment = line.slice(1).trim()
    else frame[line.slice(0, line.indexOf(':'))] = line.slice(line.indexOf(':') + 1).trim()
  }
  return frame
}
