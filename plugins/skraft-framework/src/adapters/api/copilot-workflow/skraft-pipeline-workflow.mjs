import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRunPipeline } from '../../../application/pipeline/run-pipeline.mjs'
import { createRecordDecision } from '../../../application/pipeline/record-decision.mjs'
import { createCloseManually } from '../../../application/pipeline/close-manually.mjs'
import { activePipelineSlug } from '../../../application/pipeline/active-pipeline.mjs'
import { createNodePipelineDependencies } from '../pipeline/node-dependencies.mjs'
import { createWorkflowAgentRunner } from '../../infrastructure/copilot-workflow/workflow-agent-runner.mjs'
import { createAgentReportTransport } from '../../infrastructure/reporting/agent-report-transport.mjs'
import { createWorkflowHumanInteraction } from '../../infrastructure/copilot-workflow/workflow-human-interaction.mjs'
import { createWorkflowProgress } from '../../infrastructure/copilot-workflow/workflow-progress.mjs'

// Driving adapter: the Copilot dynamic workflow `skraft-pipeline` and its tools
// `skraft_decide` and `skraft_close_phase`. The extension entry
// (com.github.copilot/extensions/skraft-pipeline/extension.mjs) only registers them with
// the SDK; this module translates the SDK's calls into the RunPipeline, RecordDecision and
// CloseManually use cases.

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const SKRAFT_PIPELINE_META = Object.freeze({
  name: 'skraft-pipeline',
  description:
    'SKRAFT engineering pipeline for one refined story: RESEARCH → DESIGN → DISTILL → DELIVER, ' +
    'each phase a specialist subagent then its reviewer, gates checked by code, resumable from state.json. ' +
    'args: { slug: string (kebab-case feature scope), issue?: number, title?: string, ' +
    'reviewMode?: "agent" | "code" (code: the DELIVER review runs its lenses from code) }.',
  phases: [
    { title: 'RESEARCH', detail: 'Solution Researcher' },
    { title: 'DESIGN', detail: 'Solution Architect + reviewer, ADR ratification' },
    { title: 'DISTILL', detail: 'Acceptance Designer + reviewer' },
    { title: 'DELIVER', detail: 'Software Engineer, qg-verify, reviewer' },
  ],
  argsSchema: {
    type: 'object',
    required: ['slug'],
    properties: {
      slug: { type: 'string' },
      issue: { type: 'integer' },
      title: { type: 'string' },
      agentIds: { type: 'object' },
      reviewMode: { type: 'string', enum: ['agent', 'code'] },
    },
  },
})

// The plugin's name (plugin.json): how a session prefixes its agents when it cannot list them.
const pluginNameOf = (pluginRoot) => {
  try { return JSON.parse(readFileSync(join(pluginRoot, 'plugin.json'), 'utf8')).name ?? null } catch { return null }
}

// The workflow body: ctx is the SDK's WorkflowContext.
export const runSkraftPipelineWorkflow = async (ctx, { cwd, pluginRoot, env }) => {
  const { slug, issue, title, agentIds, reviewMode } = ctx.args ?? {}
  if (typeof slug !== 'string' || !SLUG.test(slug)) {
    return { status: 'blocked', phase: null, reason: `slug must be kebab-case, got ${JSON.stringify(slug)}` }
  }
  ctx.log(`Follow ${slug} live in the Copilot app: open the "Skraft pipeline" canvas.`)
  const deps = createNodePipelineDependencies({ cwd, env, pluginRoot })
  const agentRunner = createWorkflowAgentRunner({ ctx, agentIds, aliases: deps.config.agentAliases, pluginName: pluginNameOf(pluginRoot) })
  const pipeline = createRunPipeline({
    ...deps,
    reviewMode: reviewMode ?? deps.reviewMode,
    agentRunner,
    reportTransportOf: (runner) => createAgentReportTransport({ agentRunner: runner, pluginRoot }),
    humanInteraction: createWorkflowHumanInteraction({ ctx }),
    progress: createWorkflowProgress({ ctx }),
  })
  const outcome = await pipeline.run({
    slug,
    story: issue || title ? { issue: issue ?? null, title: title ?? null } : null,
  })
  ctx.log(`${slug}: ${outcome.status} — ${outcome.reason}`)
  return outcome
}

export const createSkraftDecideTool = ({ cwd, pluginRoot, env }) => Object.freeze({
  name: 'skraft_decide',
  description:
    "Record the human's answer to a SKRAFT pipeline checkpoint (ADR ratification, environment fix, rejected phase). " +
    'Use only with the exact answer the human gave. Then tell them to resume the paused skraft-pipeline run.',
  parameters: {
    type: 'object',
    properties: {
      slug: { type: 'string', description: "Optional: the pipeline you expect. The tool acts on this working copy's active pipeline (.active-slug) and refuses another one." },
      key: { type: 'string', description: 'Checkpoint key the workflow logged' },
      answer: { type: 'string', description: "The human's answer, verbatim" },
    },
    required: ['key', 'answer'],
  },
  handler: async ({ slug, key, answer }) => {
    const deps = createNodePipelineDependencies({ cwd: cwd(), env, pluginRoot })
    const active = await activePipelineSlug(deps, slug)
    if (!active.ok) return `Refused: ${active.error.reason}`
    const recorded = await createRecordDecision(deps).record({ slug: active.value, key, answer })
    return recorded.ok
      ? `Recorded "${answer}" for ${key}. Resume the paused skraft-pipeline run with /workflows → R.`
      : `Refused: ${recorded.error.reason}`
  },
})

export const createSkraftClosePhaseTool = ({ cwd, pluginRoot, env }) => Object.freeze({
  name: 'skraft_close_phase',
  description:
    'Close the open, reviewed phase of a SKRAFT pipeline after the human validated their own reworks, ' +
    'instead of a reviewer APPROVED. Use only when the human asks for it. DELIVER refuses while a recent commit ' +
    'is not type(scope): subject. Then tell them to run the skraft-pipeline workflow again to resume.',
  parameters: {
    type: 'object',
    properties: {
      slug: { type: 'string', description: "Optional: the pipeline you expect. The tool acts on this working copy's active pipeline (.active-slug) and refuses another one." },
      phase: { type: 'string', description: 'The open phase, as a guard (optional)' },
      findings: { type: 'integer', minimum: 0, description: 'Findings the human rework fixed (default 0)' },
    },
    required: [],
  },
  handler: async ({ slug, phase, findings = 0 } = {}) => {
    const deps = createNodePipelineDependencies({ cwd: cwd(), env, pluginRoot })
    const active = await activePipelineSlug(deps, slug)
    if (!active.ok) return `Refused (${active.error.code}): ${active.error.reason}`
    const closed = await createCloseManually(deps).close({ slug: active.value, phase, findings })
    return closed.ok
      ? `${closed.value.phase} closed by human validation (${closed.value.review}); next: ${closed.value.next}. Run skraft-pipeline again to resume.`
      : `Refused (${closed.error.code}): ${closed.error.reason}`
  },
})
