import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { actsAs, copilotHost, simulatedContext, workingCopy } from '../copilot-workflow/simulated-host.mjs'
import { SLUG, pipelineRepository, scriptedLlm } from '../support/pipeline-repository.mjs'
import { BOUNDED, contentStream, pipelineCanvas, tokenOf, within } from './canvas-host.mjs'

/** (the step, its pass, its outcome, the step it led to) of each entry. */
const shape = ({ step, pass, outcome, next }) => ({ step, pass, outcome, next })

test('the page gets the journal of the active pipeline beside the run: its chain verified over every line, its last entries as many as the canvas shows, and how many there are', BOUNDED, async (t) => {
  const { cwd } = pipelineRepository(t)
  const { open } = pipelineCanvas(t, { directory: () => cwd, home: `${cwd}-home`, more: { journalRows: 2 } })
  const { ctx } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(scriptedLlm({ cwd })) })
  await assert.rejects(runSkraftPipelineWorkflow(ctx, copilotHost(cwd)), { message: 'paused at adr-1' })
  const opened = await open()

  const { journal } = await contentStream(t, opened.url, await tokenOf(opened.url)).next()

  const lines = readFileSync(join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).length
  assert.deepEqual({ ...journal, entries: journal?.entries.map(shape) }, {
    slug: SLUG,
    chain: { state: 'verified', lines, unverified: 0, reason: '' },
    entries: [
      { step: 'design', pass: 1, outcome: 'done', next: 'design_review' },
      { step: 'design_review', pass: 1, outcome: 'approved', next: 'adr' },
    ],
    total: 5,
  })
})

test('without a working directory the journal says so in fixed words; a pipeline that cannot be read gives the fixed text, never the exception', BOUNDED, async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  mkdirSync(join(cwd, '.copilot-tracking', 'skraft-plans', '.active-slug'), { recursive: true })
  const where = { cwd: /** @type {string | null} */ (null) }
  const { open } = pipelineCanvas(t, { directory: () => where.cwd, home: `${cwd}-home` })
  const opened = await open()
  const stream = contentStream(t, opened.url, await tokenOf(opened.url))

  const none = await within(t, 10_000, stream.next())
  assert.deepEqual(/** @type {any} */ (none).journal, { slug: null, chain: { state: 'none', code: 'no-directory', reason: 'The Copilot session has no working directory yet.', lines: 0, unverified: 0 }, entries: [], total: 0 })

  where.cwd = cwd
  const { journal } = /** @type {any} */ (await within(t, 10_000, stream.next((content) => content.journal?.chain.state === 'unreadable')))
  assert.deepEqual(journal, { slug: null, chain: { state: 'unreadable', code: 'pipeline-unreadable', reason: 'skraft could not read the pipeline of this working copy; run skraft status in a terminal.', lines: 0, unverified: 0 }, entries: [], total: 0 })
  assert.ok(!JSON.stringify(journal).includes('EISDIR'))
})
