import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { createObserve } from '../../../../plugins/skraft-framework/engine/application/pipeline/observe-usecase.mjs'
import { createNodeAdapters } from '../../../../plugins/skraft-framework/engine/infrastructure/node-adapters.mjs'
import { actsAs, copilotHost, decideTool, eventsPath, simulatedContext, trackingDir, workingCopy } from './simulated-host.mjs'
import { SENTINEL } from './simulated-sdk.mjs'
import { SLUG, WRONG_PAY, deliverWith, pipelineRepository, scriptedLlm } from '../support/pipeline-repository.mjs'

/** Every place a model reads: the outcome, the workflow log, the journal, each prompt and each tool result. */
const modelFacing = ({ outcome, logs, calls, cwd, slug, toolResults = [] }) => [
  JSON.stringify(outcome), ...logs, readFileSync(eventsPath(cwd, slug), 'utf8'), ...calls.map((call) => call.prompt), ...toolResults,
].join('\n')

/** The text of every evidence log the gates wrote for the slug. */
const evidenceLogs = (cwd, slug) => {
  const dir = join(trackingDir(cwd, slug), 'gates')
  return readdirSync(dir, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8')).join('\n')
}

test('the text of an error a Copilot agent call throws reaches neither the outcome, the log, the journal nor a prompt', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const throws = async () => { throw new Error(`${SENTINEL} at /home/someone/.ssh/id_rsa`) }
  const { ctx, logs, calls } = simulatedContext({ args: { slug: 'checkout' }, behaviours: [throws] })

  const outcome = await runSkraftPipelineWorkflow(ctx, copilotHost(cwd))

  assert.deepEqual([outcome.code, outcome.reason], ['agent-failed', 'solution-researcher stopped without finishing: skraft:solution-researcher failed: the Copilot agent call failed'])
  assert.equal(modelFacing({ outcome, logs, calls, cwd, slug: 'checkout' }).includes(SENTINEL), false)
})

test('what a failing gate writes on stderr stays in its evidence log, out of the outcome, the log, the journal, the prompts and the tool results', async (t) => {
  const { cwd } = pipelineRepository(t)
  const llm = scriptedLlm({ cwd, acts: { 'software-engineer': [deliverWith(WRONG_PAY)] } })
  const { ctx, calls, logs } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(llm) })
  const toolResults = []
  let outcome
  while (outcome === undefined) {
    try {
      outcome = await runSkraftPipelineWorkflow(ctx, copilotHost(cwd))
    } catch (error) {
      if (error.name !== 'AbortError') throw error
      const { question } = await createObserve(createNodeAdapters(copilotHost(cwd))).view()
      toolResults.push(await decideTool(cwd).handler({ key: question.key, answer: question.options[0] }))
    }
  }

  const stderr = 'pay(10) answered owed 10'
  assert.equal(outcome.status, 'done')
  assert.ok(evidenceLogs(cwd, SLUG).includes(stderr))
  assert.equal(modelFacing({ outcome, logs, calls, cwd, slug: SLUG, toolResults }).includes(stderr), false)
})
