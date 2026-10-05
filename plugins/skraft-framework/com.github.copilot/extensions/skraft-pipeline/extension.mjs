// SKRAFT pipeline as a GitHub Copilot dynamic workflow (public preview, Copilot CLI with
// --experimental). The workflow is a thin adapter: it builds the Copilot ports and hands
// over to the host-neutral use case src/application/pipeline/run-pipeline.mjs — the same
// code the Claude Code mod runs (hooks/skraft-mod.mjs).
//
// Run it:  "Run the skraft-pipeline dynamic workflow for slug checkout, issue 42"
//     or:  copilot workflow run skraft-pipeline --args '{"slug":"checkout","issue":42}'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { defineWorkflow, joinSession } from '@github/copilot-sdk/extension'
import { createRunPipeline } from '../../../src/application/pipeline/run-pipeline.mjs'
import { createCopilotWorkflowPorts } from '../../../src/adapters/hosts/copilot-workflow-ports.mjs'
import { createNodeHostPorts } from '../../../src/adapters/hosts/node-host-ports.mjs'
import { createDecisionInbox } from '../../../src/application/pipeline/decision-inbox.mjs'

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const skraftPipeline = defineWorkflow({
  meta: {
    name: 'skraft-pipeline',
    description:
      'SKRAFT engineering pipeline for one refined story: RESEARCH → DESIGN → DISTILL → DELIVER, ' +
      'each phase a specialist subagent then its reviewer, gates checked by code, resumable from state.json. ' +
      'args: { slug: string (kebab-case feature scope), issue?: number, title?: string }.',
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
      },
    },
  },
  run: async (ctx) => {
    const { slug, issue, title, agentIds } = ctx.args ?? {}
    if (typeof slug !== 'string' || !SLUG.test(slug)) {
      return { status: 'blocked', phase: null, reason: `slug must be kebab-case, got ${JSON.stringify(slug)}` }
    }
    const ports = createCopilotWorkflowPorts(ctx, { cwd: process.cwd(), pluginRoot: PLUGIN_ROOT, slug, agentIds })
    const outcome = await createRunPipeline(ports).run({
      slug,
      story: issue || title ? { issue: issue ?? null, title: title ?? null } : null,
    })
    ctx.log(`${slug}: ${outcome.status} — ${outcome.reason}`)
    return outcome
  },
})

// Records the human's answer to a checkpoint the workflow paused on; resume the run
// afterwards from /workflows (R).
const skraftDecide = {
  name: 'skraft_decide',
  description:
    "Record the human's answer to a SKRAFT pipeline checkpoint (ADR ratification, environment fix, rejected phase). " +
    'Use only with the exact answer the human gave. Then tell them to resume the paused skraft-pipeline run.',
  parameters: {
    type: 'object',
    properties: {
      slug: { type: 'string', description: 'Pipeline slug (feature scope)' },
      key: { type: 'string', description: 'Checkpoint key the workflow logged' },
      answer: { type: 'string', description: "The human's answer, verbatim" },
    },
    required: ['slug', 'key', 'answer'],
  },
  handler: async ({ slug, key, answer }) => {
    if (!SLUG.test(slug ?? '')) return `Refused: slug must be kebab-case.`
    const ports = createNodeHostPorts({ cwd: process.cwd(), pluginRoot: PLUGIN_ROOT })
    await createDecisionInbox({ trackingFiles: ports.trackingFiles, slug }).write(key, answer)
    return `Recorded "${answer}" for ${key}. Resume the paused skraft-pipeline run with /workflows → R.`
  },
}

await joinSession({ workflows: [skraftPipeline], tools: [skraftDecide] })
