// The backlog canvas declaration, built from the SDK's createCanvas and CanvasError so this module
// stays free of the SDK import and can be tested on its own. The panel is the loopback server; the
// agent gets the actions the controller marks `agent: true`.
import { createController } from './controller.mjs'
import { startServer } from './server.mjs'

export const CANVAS_ID = 'skraft-backlog'

const CRASHED = 'the backlog canvas hit an error; run the action again or reopen the canvas'

/**
 * @param {{
 *   createCanvas: (options: any) => any, CanvasError: new (code: string, message: string) => Error,
 *   cwd: string | (() => string | null), gh: import('../publish.mjs').GhRun, log?: (text: string) => void, icon?: string,
 * }} dependencies `cwd`: a function follows the Copilot session's directory, read on each open and
 * each action; `icon`: a PNG path relative to the extension folder, shown by the host in its
 * canvas menus.
 */
export const backlogCanvas = ({ createCanvas, CanvasError, cwd, gh, log = () => {}, icon }) => {
  const controller = createController({ cwd, gh })
  let server = null
  let starting = null
  const open = new Set()

  const ensureServer = async () => {
    if (server) {
      await controller.follow()
      return server
    }
    starting ??= (async () => {
      await controller.reload()
      controller.watch()
      server = await startServer({ controller, onError: (error) => log(`canvas: ${error.message}`) })
      return server
    })().catch((error) => {
      // a failed start is not kept: the next open or action starts again
      starting = null
      void controller.stop()
      throw error
    })
    return starting
  }

  /**
   * What the host and the agent get back: a request to correct says why; anything else is a crash,
   * said in a fixed text that carries none of the exception's.
   */
  const toCanvasError = (error) => (error instanceof CanvasError ? error
    : error?.name === 'UserError' ? new CanvasError('skraft_backlog_invalid_request', error.message)
      : new CanvasError('skraft_backlog_error', CRASHED))

  const canvas = createCanvas({
    id: CANVAS_ID,
    displayName: 'skraft backlog',
    description: 'Review the backlog of the skraft-prd-backlog workflow story by story — why a story is or is not INVEST and ready, with the evidence — then create the reviewed stories on GitHub.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Backlog to show (default: the most recent).' },
        story: { type: 'string', description: 'Story to open.' },
      },
      additionalProperties: false,
    },
    actions: controller.actions.filter((action) => action.agent).map((action) => ({
      name: action.name,
      description: action.description,
      inputSchema: action.inputSchema,
      handler: async (ctx) => {
        try {
          await ensureServer()
          return (await action.run(ctx.input ?? {})) ?? { ok: true }
        } catch (error) {
          throw toCanvasError(error)
        }
      },
    })),
    open: async (ctx) => {
      const byName = (name) => /** @type {any} */ (controller.actions.find((a) => a.name === name))
      let running
      try {
        running = await ensureServer()
        if (ctx.input?.slug) await byName('open_backlog').run({ slug: ctx.input.slug })
        if (ctx.input?.story) await byName('focus_story').run({ id: ctx.input.story })
      } catch (error) {
        throw toCanvasError(error)
      }
      open.add(ctx.instanceId)
      const counts = controller.state.assessment?.counts
      const run = controller.state.diagnostics?.run
      return {
        title: controller.state.slug ? `Backlog · ${controller.state.slug}` : 'Backlog',
        status: counts ? `${counts.reviewed}/${counts.ready} reviewed · ${counts.published} published` : run ? `${run.phase} · ${run.status}` : 'No backlog yet',
        url: running.url,
      }
    },
    onClose: async (ctx) => {
      open.delete(ctx.instanceId)
      if (open.size || !server) return
      const closing = server
      server = null
      starting = null
      controller.stop()
      await closing.close()
    },
  })
  // createCanvas keeps only the fields it knows; the runtime reads the icon from the declaration.
  if (icon) canvas.declaration.icon = icon
  return { canvas, controller }
}
