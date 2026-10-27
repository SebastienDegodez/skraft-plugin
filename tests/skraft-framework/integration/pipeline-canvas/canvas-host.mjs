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
 * A canvas of a session whose directory is what `directory()` says, each instance it opened
 * closed after the test.
 * @param {import('node:test').TestContext} t @param {{ directory: () => string | null, home: string, more?: object }} host
 */
export const pipelineCanvas = (t, { directory, home, more = {} }) => {
  const canvas = /** @type {any} */ (createPipelineCanvas({ createCanvas: (options) => options, CanvasError, directory, pluginRoot: PLUGIN_ROOT, home, pollMs: 20, ...more }))
  const opened = new Set()
  t.after(async () => { for (const instanceId of opened) await canvas.onClose({ instanceId }) })
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
 * One HTTP request to the panel, with the headers given as they are (Host included). An event
 * stream is answered with its status and headers alone, and closed.
 * @param {string} url @param {{ method?: string, headers?: Record<string, string>, body?: string }} [options]
 * @returns {Promise<{ status: number, headers: import('node:http').IncomingHttpHeaders, text: string }>}
 */
export const request = (url, { method = 'GET', headers = {}, body } = {}) => new Promise((done, fail) => {
  const sent = httpRequest(url, { method, headers }, (res) => {
    if (res.headers['content-type'] === 'text/event-stream') {
      done({ status: res.statusCode ?? 0, headers: res.headers, text: '' })
      return sent.destroy()
    }
    let text = ''
    res.setEncoding('utf8')
    res.on('data', (chunk) => { text += chunk })
    res.on('end', () => done({ status: res.statusCode ?? 0, headers: res.headers, text }))
  })
  sent.on('error', fail)
  sent.end(body)
})

/** How long a test waits for the stream's next content. */
const STREAM_WAIT_MS = 5000

/** The token the panel's page carries. @param {string} url */
export const tokenOf = async (url) => /** @type {RegExpMatchArray} */ ((await request(url)).text.match(/name="skraft-panel-token" content="([0-9a-f]+)"/))[1]

/**
 * The panel's content stream, read as a page reads it: `next(until)` waits for the first content
 * `until` accepts, among those not read yet.
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
  let read = 0
  /** @param {(content: any) => boolean} [until] @returns {Promise<any>} */
  const next = async (until = () => true) => {
    const deadline = Date.now() + STREAM_WAIT_MS
    for (;;) {
      while (read < received.length) {
        const content = received[read++]
        if (until(content)) return content
      }
      if (Date.now() > deadline) throw new Error(`no new content within ${STREAM_WAIT_MS} ms`)
      await new Promise((wake) => { waiting.push(wake); setTimeout(wake, 100) })
    }
  }
  return { next, received }
}
