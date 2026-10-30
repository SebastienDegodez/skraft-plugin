import { configurationContent, panelContent, pipelineContent, saveConfiguration } from './canvas-content.mjs'
import { startPanel } from './canvas-server.mjs'

/**
 * The `skraft-pipeline` canvas of the Copilot session: a panel with three tabs. Run draws the
 * Observe view of the active pipeline (`.active-slug`) of the session's directory; Configuration
 * shows the configuration a run starts with and takes the edits the person makes there, which
 * the engine checks and saves; Workflow draws each workflow a run can follow. Everything is read
 * on each open, each action and each refresh of the page, never at load. Built from the SDK's
 * `createCanvas` and `CanvasError`, which the extension entry hands over. Each open instance gets
 * its own loopback server, started by `open` (Copilot CLI 1.0.102-1 calls `open` again for an
 * instance already open: probe check `canvas-open-headless`; with another `input` it calls `open`
 * with it, and gives the instance the new url: probe check `canvas-reopen-other-tab`, 1.0.105),
 * closed by `onClose`; `open` takes the tab the page shows first, and pushes it to a page already
 * open. It takes no answer, neither from its actions, read-only, nor from
 * its page: Copilot puts each question to the person in the chat (ctx-human.mjs); no action
 * writes the configuration, which a model never chooses. A refusal or a failure is a CanvasError
 * with a fixed text.
 *
 * @typedef {import('./canvas-content.mjs').ContentHost & {
 *   createCanvas: (options: object) => object,
 *   CanvasError: new (code: string, message: string) => Error,
 *   pollMs: number,
 *   limits?: import('./canvas-server.mjs').PanelHost['limits'],
 * }} CanvasHost
 *   pollMs: how often an open page's content is read again; limits: the times of each panel's server (tests).
 * @typedef {{ instanceId?: unknown, input?: unknown }} CanvasRequest
 * @typedef {Map<unknown, Promise<import('./canvas-server.mjs').RunningPanel>>} Panels
 */

export const PIPELINE_CANVAS = 'skraft-pipeline'
/** Open panels at most, each with its own server: an instance id is chosen by the caller, and a panel goes only by onClose. */
const MAX_PANELS = 4

// Stryker disable StringLiteral: text shown to the person and the model; no engine behaviour reads it
const DESCRIPTION = "Follow the active skraft pipeline of this working copy live: the workflow's phases and steps, the step under way, reviews, gates and the question it waits on."
const GET_DESCRIPTION = 'Return what the skraft-pipeline canvas shows now: phases and steps, the step under way, reviews, gates and the question the run waits on. Changes nothing.'
const CONFIGURATION_DESCRIPTION = 'Return the configuration a skraft run of this working copy starts with, as its Configuration tab shows it: the forge, components and their commands, consents, models of each agent, quality bar. Changes nothing.'
// Stryker restore StringLiteral
const TABS = Object.freeze(['run', 'configuration', 'workflow'])
const INVALID_INPUT = `the skraft-pipeline canvas takes only tab, one of ${TABS.slice(0, -1).join(', ')} and ${TABS.at(-1)}; it shows the active pipeline of this working copy`
const TOO_MANY = 'too many skraft-pipeline canvases are open; close one first'
// Stryker disable next-line StringLiteral: unreachable in a test: a loopback listen on port 0 does not fail on a test machine
const FAILED = 'the skraft-pipeline canvas could not start; run skraft status in a terminal'

const NO_INPUT = Object.freeze({ type: 'object', properties: Object.freeze({}), additionalProperties: false })
const TAB_INPUT = Object.freeze({ type: 'object', properties: Object.freeze({ tab: Object.freeze({ type: 'string', enum: TABS }) }), additionalProperties: false })

/** @param {CanvasHost} host */
export const createPipelineCanvas = (host) => host.createCanvas(declared(host, new Map()))

/** @param {CanvasHost} host @param {Panels} panels */
const declared = (host, panels) => ({
  id: PIPELINE_CANVAS,
  displayName: 'skraft pipeline',
  description: DESCRIPTION,
  inputSchema: TAB_INPUT,
  actions: [
    { name: 'get_pipeline', description: GET_DESCRIPTION, inputSchema: NO_INPUT, handler: (/** @type {CanvasRequest} */ ctx) => shown(host, ctx, pipelineContent) },
    { name: 'get_configuration', description: CONFIGURATION_DESCRIPTION, inputSchema: NO_INPUT, handler: (/** @type {CanvasRequest} */ ctx) => shown(host, ctx, configurationContent) },
  ],
  open: (/** @type {CanvasRequest} */ ctx) => opened(host, panels, ctx),
  onClose: (/** @type {CanvasRequest} */ ctx) => closed(panels, ctx.instanceId),
})

/**
 * What a tab of the page shows now, for the model.
 * @param {CanvasHost} host @param {CanvasRequest} ctx @param {(host: CanvasHost) => Promise<object>} content
 */
const shown = async (host, ctx, content) => {
  refuseInput(host, ctx, [])
  return content(host)
}

/**
 * The instance's panel, started on its first open; its url, and the title and status the host
 * shows beside it.
 * @param {CanvasHost} host @param {Panels} panels @param {CanvasRequest} ctx
 */
const opened = async (host, panels, ctx) => {
  const { tab } = refuseInput(host, ctx, ['tab'])
  const panel = await panelOf(host, panels, ctx.instanceId)
  const { title, status } = await pipelineContent(host)
  if (tab !== undefined) panel.focus(tab)
  return { url: tab === undefined ? panel.url : `${panel.url}&tab=${tab}`, title, status }
}

/**
 * The input, when it holds only the keys given, and a tab the canvas has: the canvas shows the
 * active pipeline, never one a caller names.
 * @param {CanvasHost} host @param {CanvasRequest} ctx @param {string[]} keys
 * @returns {{ tab?: string }}
 */
const refuseInput = (host, ctx, keys) => {
  const input = ctx.input ?? {}
  if (!isInput(input, keys)) throw new host.CanvasError('skraft_invalid_input', INVALID_INPUT)
  return /** @type {{ tab?: string }} */ (input)
}

/** @param {unknown} input @param {string[]} keys */
const isInput = (input, keys) => typeof input === 'object' && input !== null && !Array.isArray(input)
  && Object.entries(input).every(([key, value]) => keys.includes(key) && TABS.includes(value))

/**
 * The running panel of an instance; a new one, past MAX_PANELS once the oldest panel a page left
 * is closed. A panel that fails to start is forgotten, so the next open tries again.
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
 * Closes the oldest panel a page left; refuses when every other panel has its page, or waits for
 * its first (a panel just opened is not a panel to close).
 * @param {CanvasHost} host @param {Panels} panels
 */
const freedSlot = async (host, panels) => {
  const idle = await oldestIdle(panels)
  if (idle === undefined) throw new host.CanvasError('skraft_too_many_canvases', TOO_MANY)
  await closed(panels, idle)
}

/** @param {Panels} panels @returns {Promise<unknown>} the instance id, undefined when none is idle */
const oldestIdle = async (panels) => {
  for (const [instanceId, running] of panels) {
    if ((await running).idle()) return instanceId
  }
}

/** What a panel shows. @param {CanvasHost} host @returns {import('./canvas-server.mjs').PanelHost} */
const panelHost = (host) => ({
  content: () => panelContent(host),
  pollMs: host.pollMs,
  limits: host.limits,
  save: (edit) => saveConfiguration(host, edit),
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
