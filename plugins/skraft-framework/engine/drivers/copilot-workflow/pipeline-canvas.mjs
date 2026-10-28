import { pipelineContent } from './canvas-content.mjs'
import { startPanel } from './canvas-server.mjs'
import { recordAnswer } from './skraft-decide-tool.mjs'

/**
 * The `skraft-pipeline` canvas of the Copilot session: a panel that draws the Observe view of the
 * active pipeline (`.active-slug`) of the session's directory, read on each open, each action and
 * each refresh of the page, never at load. Built from the SDK's `createCanvas` and `CanvasError`,
 * which the extension entry hands over. Each open instance gets its own loopback server, started
 * by `open` (Copilot CLI 1.0.102-1 calls `open` again for an instance already open: probe check
 * `canvas-open-headless`), closed by `onClose`. Its one action is read-only: the model cannot
 * answer through the canvas. An answer button of the page records only through recordAnswer,
 * the path of `skraft_decide`, once the person confirmed it in the host's dialog (a request of
 * the page reaches the host's confirmation: probe check `confirm-from-canvas`, Copilot CLI
 * 1.0.102-1). A refusal or a failure is a CanvasError with a fixed text.
 *
 * @typedef {import('./canvas-content.mjs').ContentHost & {
 *   createCanvas: (options: object) => object,
 *   CanvasError: new (code: string, message: string) => Error,
 *   confirmation: import('../../application/ports/decision-confirmation.mjs').DecisionConfirmation,
 *   pollMs: number,
 * }} CanvasHost
 *   pollMs: how often an open page's content is read again.
 * @typedef {{ instanceId?: unknown, input?: unknown }} CanvasRequest
 * @typedef {Map<unknown, Promise<import('./canvas-server.mjs').RunningPanel>>} Panels
 */

export const PIPELINE_CANVAS = 'skraft-pipeline'
/** Open panels at most, each with its own server: an instance id is chosen by the caller, and a panel goes only by onClose. */
const MAX_PANELS = 4

// Stryker disable StringLiteral: text shown to the person and the model; no engine behaviour reads it
const DESCRIPTION = "Follow the active skraft pipeline of this working copy live: the workflow's phases and steps, the step under way, reviews, gates and the question it waits on."
const GET_DESCRIPTION = 'Return what the skraft-pipeline canvas shows now: phases and steps, the step under way, reviews, gates and the question the run waits on. Changes nothing.'
// Stryker restore StringLiteral
const INVALID_INPUT = 'the skraft-pipeline canvas takes no input; it shows the active pipeline of this working copy'
const TOO_MANY = 'too many skraft-pipeline canvases are open; close one first'
// Stryker disable next-line StringLiteral: unreachable in a test: a loopback listen on port 0 does not fail on a test machine
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
  onClose: (/** @type {CanvasRequest} */ ctx) => closed(panels, ctx.instanceId),
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
  const panel = await panelOf(host, panels, ctx.instanceId)
  const { title, status } = await pipelineContent(host)
  return { url: panel.url, title, status }
}

/** No input is taken: the canvas shows the active pipeline, never one a caller names. @param {CanvasHost} host @param {CanvasRequest} ctx */
const refuseInput = (host, ctx) => {
  const input = ctx.input ?? {}
  if (typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length > 0) throw new host.CanvasError('skraft_invalid_input', INVALID_INPUT)
}

/**
 * The running panel of an instance; a new one, past MAX_PANELS once the oldest panel no page
 * listens to is closed. A panel that fails to start is forgotten, so the next open tries again.
 * @param {CanvasHost} host @param {Panels} panels @param {unknown} instanceId
 */
const panelOf = async (host, panels, instanceId) => {
  const running = panels.get(instanceId)
  if (running !== undefined) return running
  if (panels.size >= MAX_PANELS) await freedSlot(host, panels)
  // Stryker disable next-line ArrowFunction: unreachable in a test: a loopback listen on port 0 does not fail on a test machine
  const starting = startPanel(panelHost(host)).catch(() => failed(host, panels, instanceId))
  panels.set(instanceId, starting)
  return starting
}

/**
 * Closes the oldest panel no page listens to; refuses when a page listens to each.
 * @param {CanvasHost} host @param {Panels} panels
 */
const freedSlot = async (host, panels) => {
  const idle = await oldestIdle(panels)
  if (idle === undefined) throw new host.CanvasError('skraft_too_many_canvases', TOO_MANY)
  await closed(panels, idle)
}

/** @param {Panels} panels @returns {Promise<unknown>} the instance id, undefined when a page listens to each */
const oldestIdle = async (panels) => {
  for (const [instanceId, running] of panels) {
    if (!(await running).listened()) return instanceId
  }
}

/** What a panel shows, and how it records an answer. @param {CanvasHost} host @returns {import('./canvas-server.mjs').PanelHost} */
const panelHost = (host) => ({
  content: () => pipelineContent(host),
  answer: (input) => recordAnswer(host, input),
  pollMs: host.pollMs,
})

/**
 * A panel whose server could not start: forgotten, so that the next open tries again, and said in
 * a fixed text.
 * @param {CanvasHost} host @param {Panels} panels @param {unknown} instanceId @returns {never}
 */
// Stryker disable next-line BlockStatement: unreachable in a test: a loopback listen on port 0 does not fail on a test machine
const failed = (host, panels, instanceId) => {
  panels.delete(instanceId)
  // Stryker disable next-line StringLiteral: unreachable in a test: a loopback listen on port 0 does not fail on a test machine
  throw new host.CanvasError('skraft_canvas_failed', FAILED)
}

/** @param {Panels} panels @param {unknown} instanceId */
const closed = async (panels, instanceId) => {
  const running = panels.get(instanceId)
  panels.delete(instanceId)
  const panel = await running?.catch(() => undefined)
  await panel?.close()
}
