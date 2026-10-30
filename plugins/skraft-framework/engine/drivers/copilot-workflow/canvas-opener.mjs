import { PIPELINE_CANVAS } from './pipeline-canvas.mjs'

/**
 * Opens the skraft canvas on a tab from the run, through the joined session's own
 * `rpc.canvas.open`, which the host answers by calling the canvas's `open` (probe check
 * `canvas-open-from-extension`, Copilot CLI 1.0.102-1). One instance, so that each run opens the
 * same panel again rather than a new one. Best effort: a session that cannot open it, that throws
 * or that does not answer in time leaves the question in the chat, which names the tab.
 *
 * @typedef {{ rpc?: { canvas?: { open?: (request: { canvasId: string, instanceId: string, input: object }) => Promise<unknown> } } }} OpeningSession
 * @typedef {{ show: (tab: 'configuration') => Promise<void> }} CanvasOpener
 */

/** The instance a run opens, the same each time. */
export const RUN_INSTANCE = 'skraft-run'
/** How long the host has to open it. */
const OPEN_MS = 5000

/** @param {{ session: () => OpeningSession | null, waitMs?: number }} host @returns {CanvasOpener} */
// Stryker disable next-line ObjectLiteral: the tests that keep this wait answer at once; the time itself is not observable there
export const createCanvasOpener = ({ session, waitMs = OPEN_MS }) => Object.freeze({
  show: (tab) => opened(session(), tab, waitMs),
})

/** @param {OpeningSession | null} joined @param {string} tab @param {number} waitMs */
const opened = async (joined, tab, waitMs) => {
  /** @type {NodeJS.Timeout | undefined} */
  let timer
  try {
    const late = new Promise((done) => { timer = setTimeout(done, waitMs) })
    await Promise.race([joined?.rpc?.canvas?.open?.({ canvasId: PIPELINE_CANVAS, instanceId: RUN_INSTANCE, input: { tab } }), late])
  } catch {
    // the canvas is a help: the question in the chat names the tab
  } finally {
    clearTimeout(timer)
  }
}
