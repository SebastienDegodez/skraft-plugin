// The skraft-pipeline canvas on a simulated Copilot canvas host: createCanvas keeps the options
// it is given, as the SDK keeps the handlers, and the test calls open, the action and onClose as
// the host would. Requests reach the panel's real loopback server.
import { request as httpRequest } from 'node:http'
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
 * The panel's content stream, read as a page reads it: `next(until)` waits for the first content
 * `until` accepts, among those not read yet, until the test ends. The stream closes after the
 * test, and once its signal aborts.
 * @param {import('node:test').TestContext} t @param {string} url @param {string} token
 */
export const contentStream = (t, url, token) => {
  const received = []
  const waiting = []
  const sent = httpRequest(new URL(`/events?token=${token}`, url), (res) => {
    let buffer = ''
    res.setEncoding('utf8')
    res.on('data', (chunk) => {
      buffer += chunk
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? ''
      for (const block of blocks) received.push(JSON.parse(block.replace(/^data: /, '')))
      for (const wake of waiting.splice(0)) wake()
    })
  })
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
  return { next, received, close }
}
