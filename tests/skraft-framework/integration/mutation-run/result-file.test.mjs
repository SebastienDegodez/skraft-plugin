import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInit } from '../../../../plugins/skraft-framework/engine/application/pipeline/init-usecase.mjs'
import { createRunPipeline } from '../../../../plugins/skraft-framework/engine/application/pipeline/run-pipeline-usecase.mjs'
import { createNodeFiles } from '../../../../plugins/skraft-framework/engine/infrastructure/files/node-files.mjs'
import { createPluginWorkflows } from '../../../../plugins/skraft-framework/engine/infrastructure/workflows/plugin-workflows.mjs'
import { commitAll, inProcessServices, journal, PLUGIN_ROOT } from '../support/workspace.mjs'
import { pipelineRepository, SLUG } from '../support/pipeline-repository.mjs'

/** A mutation command that writes its result, score computed, to the file SKRAFT_MUTATION_RESULT names. */
const WRITES_RESULT = [
  "import { writeFileSync } from 'node:fs'",
  "writeFileSync(process.env.SKRAFT_MUTATION_RESULT, JSON.stringify({ scopes: [{ name: 'global', score: 85.5 }] }))",
  '',
].join('\n')

test('a mutation run starts each component\'s mutation command with SKRAFT_MUTATION_RESULT naming a file of its run, and judges what the command wrote there', async (t) => {
  const { cwd } = pipelineRepository(t)
  writeFileSync(join(cwd, 'tools', 'mutate.mjs'), WRITES_RESULT)
  commitAll(cwd)
  const adapters = {
    ...inProcessServices(cwd).adapters(),
    workflowSource: createPluginWorkflows({ files: createNodeFiles(), pluginRoot: PLUGIN_ROOT, name: 'mutation' }),
    // A run whose mutation passes dispatches no agent and asks no one.
    agentRunner: { run: async () => assert.fail('no agent is dispatched'), review: async () => assert.fail('no lens is dispatched') },
    human: { ask: async (question) => assert.fail(`no one is asked: ${JSON.stringify(question).slice(0, 600)}`) },
    progress: { phase: () => {}, log: () => {} },
  }

  assert.equal((await createInit(adapters).init({ slug: SLUG })).ok, true)
  const outcome = await createRunPipeline(adapters).run({ slug: SLUG })

  assert.equal(outcome.status, 'done', outcome.reason)
  const ran = journal(cwd, SLUG).filter((event) => event.type === 'gate.ran')
  assert.deepEqual(ran.map(({ gate, status, scores }) => [gate, status, scores]), [['mutation', 'pass', [{ scope: 'global', bar: 80, score: 85.5, counted: null, survivors: [] }]]])
})
