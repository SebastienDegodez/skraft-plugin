// What the browser tests of the skraft-pipeline canvas page stand on: a scripted run paused on its
// ADR, and a panel opened over it as Copilot opens it. Not a test file: Playwright specs import it.
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { createPipelineCanvas } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/pipeline-canvas.mjs'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { createDecide } from '../../../../plugins/skraft-framework/engine/application/decisions/decide-usecase.mjs'
import { createNodeAdapters } from '../../../../plugins/skraft-framework/engine/infrastructure/node-adapters.mjs'
import { actsAs, copilotHost, simulatedContext } from '../copilot-workflow/simulated-host.mjs'
import { SLUG, pipelineRepository, scriptedLlm } from '../support/pipeline-repository.mjs'
import { PLUGIN_ROOT } from '../support/workspace.mjs'
import { CanvasError } from './canvas-host.mjs'

/**
 * The part of node:test's TestContext the integration helpers use: `after` hooks, run by `close`.
 * @returns {{ t: { after: (fn: () => void) => void, signal: AbortSignal }, close: () => void }}
 */
export const scope = () => {
  const hooks = []
  const controller = new AbortController()
  return {
    t: { after: (fn) => hooks.push(fn), signal: controller.signal },
    close: () => {
      controller.abort()
      for (const hook of hooks.reverse()) hook()
    },
  }
}

/** The scripted pipeline run to its first ADR, where it pauses: returns its directory and home. @param {{ after: (fn: () => void) => void }} t */
export const pausedRun = async (t) => {
  const { cwd } = pipelineRepository(/** @type {any} */ (t))
  const home = `${cwd}-home`
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const { ctx } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(scriptedLlm({ cwd })) })
  const paused = await runSkraftPipelineWorkflow(ctx, copilotHost(cwd)).then(() => null, (error) => error.message)
  if (paused !== 'paused at adr-1') throw new Error(`the scripted run did not pause at its ADR: ${paused}`)
  return { cwd, home }
}

/**
 * The scripted run, its ADR then rejected with `reason` through the engine's decide, as a person does
 * with skraft decide: the journal holds a human decision. @param {{ after: (fn: () => void) => void }} t @param {string} reason
 */
export const decidedRun = async (t, reason) => {
  const run = await pausedRun(t)
  const decided = await createDecide(createNodeAdapters(copilotHost(run.cwd))).decide({ answer: 'REJECTED', reason })
  if (!decided.ok) throw new Error(`the ADR could not be rejected: ${decided.reason}`)
  return run
}

/** The journal file of the scripted run in `cwd`. @param {string} cwd */
export const journalFile = (cwd) => join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, 'events.jsonl')

let opened = 0
/**
 * A panel of the canvas, as the host opens it. `where.cwd` is the session's directory, read live.
 * @param {{ where: { cwd: string | null }, home: string, tab?: string, journalRows?: number }} options
 * @returns {Promise<{ url: string, reopen: (tab: string) => Promise<unknown>, close: () => Promise<unknown> }>}
 */
export const openPanel = async ({ where, home, tab, journalRows = 200 }) => {
  const canvas = /** @type {any} */ (createPipelineCanvas({ createCanvas: (options) => options, CanvasError, directory: () => where.cwd, pluginRoot: PLUGIN_ROOT, home, pollMs: 100, journalRows }))
  const instanceId = `page-${++opened}`
  const { url } = await canvas.open({ instanceId, input: tab ? { tab } : {} })
  return { url, reopen: (/** @type {string} */ reopenTab) => canvas.open({ instanceId, input: { tab: reopenTab } }), close: () => canvas.onClose({ instanceId }) }
}
