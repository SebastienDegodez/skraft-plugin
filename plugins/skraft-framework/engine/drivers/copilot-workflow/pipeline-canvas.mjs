import { pipelineContent } from './canvas-content.mjs'
import { startPanel } from './canvas-server.mjs'

/**
 * The `skraft-pipeline` canvas of the Copilot session: a panel that draws the Observe view of the
 * active pipeline (`.active-slug`) of the session's directory, read on each open, each action and
 * each refresh of the page, never at load. Built from the SDK's `createCanvas` and `CanvasError`,
 * which the extension entry hands over. Each open instance gets its own loopback server, started
 * by `open` (Copilot CLI 1.0.102-1 calls `open` again for an instance already open: probe check
 * `canvas-open-headless`), closed by `onClose`. Its one action is read-only. A refusal or a
 * failure is a CanvasError with a fixed text.
 *
 * @typedef {import('./canvas-content.mjs').ContentHost & {
 *   createCanvas: (options: object) => object,
 *   CanvasError: new (code: string, message: string) => Error,
 *   pollMs?: number,
 * }} CanvasHost
 * @typedef {{ instanceId?: unknown, input?: unknown }} CanvasRequest
 * @typedef {Map<unknown, Promise<import('./canvas-server.mjs').RunningPanel>>} Panels
 */

export const PIPELINE_CANVAS = 'skraft-pipeline'
/** How often an open page's content is read again. */
const POLL_MS = 1000
/** Open panels at most, each with its own server: an instance id is chosen by the caller. */
const MAX_PANELS = 4

// Stryker disable StringLiteral: text shown to the person and the model; no engine behaviour reads it
const DESCRIPTION = "Follow the active skraft pipeline of this working copy live: the workflow's phases and steps, the step under way, reviews, gates, cost and the question it waits on."
const GET_DESCRIPTION = 'Return what the skraft-pipeline canvas shows now: phases and steps, the step under way, reviews, gates, cost and the question the run waits on. Changes nothing.'
// Stryker restore StringLiteral
const INVALID_INPUT = 'the skraft-pipeline canvas takes no input; it shows the active pipeline of this working copy'
const TOO_MANY = 'too many skraft-pipeline canvases are open; close one first'
const FAILED = 'the skraft-pipeline canvas could not start; run skraft status in a terminal'

const NO_INPUT = Object.freeze({ type: 'object', properties: Object.freeze({}), additionalProperties: false })

/** @param {CanvasHost} host */
export const createPipelineCanvas = (host) => host.createCanvas(declared(host, new Map()))

/** @param {CanvasHost} host @param {Panels} panels */
const declared = (host, panels) => ({
  id: PIPELINE_CANVAS,
  displayName: 'skraft pipeline',
  description: DESCRIPTION,
  inputSchema: NO_INPUT,
  actions: [{ name: 'get_pipeline', description: GET_DESCRIPTION, inputSchema: NO_INPUT, handler: (/** @type {CanvasRequest} */ ctx) => shown(host, ctx) }],
  open: (/** @type {CanvasRequest} */ ctx) => opened(host, panels, ctx),
  onClose: (/** @type {CanvasRequest} */ ctx) => closed(panels, ctx?.instanceId),
})

/** What the page shows now, for the model. @param {CanvasHost} host @param {CanvasRequest} ctx */
const shown = async (host, ctx) => {
  refuseInput(host, ctx)
  return pipelineContent(host)
}

/**
 * The instance's panel, started on its first open; its url, and the title and status the host
 * shows beside it.
 * @param {CanvasHost} host @param {Panels} panels @param {CanvasRequest} ctx
 */
const opened = async (host, panels, ctx) => {
  refuseInput(host, ctx)
  const panel = await panelOf(host, panels, ctx?.instanceId)
  const { title, status } = await pipelineContent(host)
  return { url: panel.url, title, status }
}

/** No input is taken: the canvas shows the active pipeline, never one a caller names. @param {CanvasHost} host @param {CanvasRequest} ctx */
const refuseInput = (host, ctx) => {
  const input = ctx?.input ?? {}
  if (typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length > 0) throw new host.CanvasError('skraft_invalid_input', INVALID_INPUT)
}

/**
 * The running panel of an instance; a new one while fewer than MAX_PANELS are open. A panel
 * that fails to start is forgotten, so the next open tries again.
 * @param {CanvasHost} host @param {Panels} panels @param {unknown} instanceId
 */
const panelOf = (host, panels, instanceId) => {
  const running = panels.get(instanceId)
  if (running !== undefined) return running
  if (panels.size >= MAX_PANELS) throw new host.CanvasError('skraft_too_many_canvases', TOO_MANY)
  const starting = startPanel({ content: () => pipelineContent(host), pollMs: host.pollMs ?? POLL_MS }).catch(() => failed(host, panels, instanceId))
  panels.set(instanceId, starting)
  return starting
}

/** @param {CanvasHost} host @param {Panels} panels @param {unknown} instanceId @returns {never} */
const failed = (host, panels, instanceId) => {
  panels.delete(instanceId)
  throw new host.CanvasError('skraft_canvas_failed', FAILED)
}

/** @param {Panels} panels @param {unknown} instanceId */
const closed = async (panels, instanceId) => {
  const running = panels.get(instanceId)
  panels.delete(instanceId)
  const panel = await running?.catch(() => undefined)
  await panel?.close()
}
