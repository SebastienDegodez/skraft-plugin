import { fileURLToPath } from 'node:url'
import { createObservePipeline } from '../../../application/pipeline/observe-pipeline.mjs'
import { createRecordDecision } from '../../../application/pipeline/record-decision.mjs'
import { createNodePipelineDependencies } from '../pipeline/node-dependencies.mjs'
import { startCanvasServer } from './canvas-server.mjs'
import { isPipelineSlug } from '../../../domain/pipeline/pipeline-selection-policy.mjs'

// Driving adapter: the `skraft-pipeline` canvas of the GitHub Copilot app. Returns the
// options of the SDK's createCanvas — the extension entry passes them through — so this
// module needs no SDK and is tested as is. Each open instance gets its own local server
// (canvas-server.mjs) showing one pipeline, or the list to choose from; the agent reaches
// the same use cases through the canvas actions.
//
//   open    { slug? }              → { url, title, status }; no slug: the pipeline of the
//                                    current branch, else the active one, else the only
//                                    one, else the list of pipelines (it always opens)
//   actions get_pipeline           → the pipeline view (ObservePipeline), or the list
//           select_pipeline { slug } → show that pipeline
//           decide { key, answer } → RecordDecision, then the page shows it answered
//           show_phase { phase }   → the page scrolls to that phase
//           refresh                → the page redraws now
const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url))

export const SKRAFT_CANVAS_ID = 'skraft-pipeline'

// The euro rate the cost is shown with: SKRAFT_EUR_PER_USD (e.g. 0.86), set by the person
// who knows the day's rate. Absent or malformed: no euros, credits and dollars only.
export const eurPerUsdOf = (env = {}) => {
  const rate = Number.parseFloat(String(env.SKRAFT_EUR_PER_USD ?? '').replace(',', '.'))
  return Number.isFinite(rate) && rate > 0 ? rate : null
}

const titleOf = (slug) => (slug ? `Skraft · ${slug}` : 'Skraft pipelines')

export class CanvasRequestError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const statusLine = (view) => {
  if (view.chooser) return view.pipelines.length ? `${view.pipelines.length} pipelines — choose one` : 'no pipeline yet'
  if (!view.started) return 'not started'
  if (view.done) return 'DONE'
  const run = view.run?.status ? ` · ${view.run.status}` : ''
  return `${view.currentPhase}${run}`
}

// cwd() — the session working directory when the host gives none; sendPrompt(prompt) —
// the chat of the session; makeError(code, message) — the SDK's CanvasError.
export const createSkraftPipelineCanvas = ({ cwd, pluginRoot, env, sendPrompt, makeError = (code, message) => new CanvasRequestError(code, message), pollMs }) => {
  const instances = new Map() // instanceId → { server, observe, recordDecision }

  const useCases = (workingDirectory) => {
    const deps = createNodePipelineDependencies({ cwd: workingDirectory, env, pluginRoot })
    const pricing = { eurPerUsd: eurPerUsdOf(env) }
    return { observe: createObservePipeline({ ...deps, pricing }), recordDecision: createRecordDecision(deps) }
  }
  const instanceOf = (ctx) => {
    const instance = instances.get(ctx.instanceId)
    if (!instance) throw makeError('canvas_not_open', 'This Skraft pipeline canvas is not open.')
    return instance
  }

  return Object.freeze({
    id: SKRAFT_CANVAS_ID,
    displayName: 'Skraft pipeline',
    description: 'Follow a SKRAFT engineering pipeline live: phases, attempts, reviews and verdicts, the question it waits for (answer it in one click), decisions, reports and the run log.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        slug: { type: 'string', description: 'Pipeline slug (kebab-case feature scope). Omitted: the pipeline of the current branch, else the active or only one, else the list to choose from.' },
      },
    },
    actions: [
      {
        name: 'get_pipeline',
        description: 'Return where the pipeline shown in this canvas stands: phases (status, attempt, verdict, reviews, artefacts), the open question, decisions, reports and the recent run log.',
        inputSchema: { type: 'object', additionalProperties: false, properties: {} },
        handler: async (ctx) => {
          const instance = instanceOf(ctx)
          const slug = instance.server.slug()
          return slug ? instance.observe.snapshot(slug) : (await instance.observe.locate()).chooser
        },
      },
      {
        name: 'select_pipeline',
        description: 'Show another pipeline of this repository in the canvas (one of those get_pipeline lists when none is chosen).',
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: { slug: { type: 'string', description: 'Pipeline slug (kebab-case)' } },
          required: ['slug'],
        },
        handler: async (ctx) => {
          const instance = instanceOf(ctx)
          if (!(await instance.server.select(ctx.input?.slug))) throw makeError('pipeline_unknown', `No pipeline "${ctx.input?.slug}" in this repository.`)
          return { slug: instance.server.slug() }
        },
      },
      {
        name: 'decide',
        description: "Record the human's answer to the checkpoint the pipeline waits for. Use only with the exact answer the human gave; then resume the skraft-pipeline workflow.",
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            key: { type: 'string', description: 'Checkpoint key shown in the canvas' },
            answer: { type: 'string', description: "The human's answer, verbatim" },
          },
          required: ['key', 'answer'],
        },
        handler: async (ctx) => {
          const instance = instanceOf(ctx)
          const slug = instance.server.slug()
          if (!slug) throw makeError('pipeline_unknown', 'No pipeline is shown: choose one first (select_pipeline).')
          const recorded = await instance.recordDecision.record({ slug, key: ctx.input?.key, answer: ctx.input?.answer, by: 'human' })
          if (!recorded.ok) throw makeError('decision_refused', recorded.error.reason)
          await instance.server.refresh()
          return { recorded: recorded.value.key }
        },
      },
      {
        name: 'show_phase',
        description: 'Scroll the canvas to one phase of the pipeline.',
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: { phase: { type: 'string', enum: ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER'] } },
          required: ['phase'],
        },
        handler: async (ctx) => {
          instanceOf(ctx).server.focus(ctx.input?.phase)
          return { phase: ctx.input?.phase }
        },
      },
      {
        name: 'refresh',
        description: 'Redraw the canvas from the files on disk now.',
        inputSchema: { type: 'object', additionalProperties: false, properties: {} },
        handler: async (ctx) => {
          const view = await instanceOf(ctx).server.refresh()
          return { status: statusLine(view) }
        },
      },
    ],

    open: async (ctx) => {
      const existing = instances.get(ctx.instanceId)
      if (existing) {
        const view = await existing.server.refresh()
        return { url: existing.server.url, title: titleOf(existing.server.slug()), status: statusLine(view) }
      }
      const requested = ctx.input?.slug
      if (requested !== undefined && requested !== null && requested !== '' && !isPipelineSlug(requested)) {
        throw makeError('invalid_slug', `"${requested}" is not a pipeline slug (kebab-case, e.g. checkout-payment).`)
      }
      const workingDirectory = ctx.session?.workingDirectory ?? cwd()
      const { observe, recordDecision } = useCases(workingDirectory)
      const located = await observe.locate(requested || null)
      const server = await startCanvasServer({ slug: located.slug, observe, recordDecision, sendPrompt, publicDir: PUBLIC_DIR, pollMs })
      instances.set(ctx.instanceId, { server, observe, recordDecision })
      const view = located.slug ? await observe.snapshot(located.slug) : located.chooser
      return { url: server.url, title: titleOf(located.slug), status: statusLine(view) }
    },

    onClose: async (ctx) => {
      const instance = instances.get(ctx.instanceId)
      if (!instance) return
      instances.delete(ctx.instanceId)
      await instance.server.close()
    },
  })
}
