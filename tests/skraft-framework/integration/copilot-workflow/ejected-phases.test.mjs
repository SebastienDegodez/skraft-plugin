import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { PLUGIN_ROOT, copilotHost, fillsOutputs, journalEvents, settled, simulatedContext, stops, workingCopy } from './simulated-host.mjs'

test('a phase only an ejected workflow names opens on the host like a declared one: the run goes on and its log says each phase', async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const ejected = (await readFile(join(PLUGIN_ROOT, 'workflows', 'pipeline.skraft.dot'), 'utf8')).replaceAll('phase="RESEARCH"', 'phase="DISCOVER"')
  await mkdir(join(cwd, '.skraft'), { recursive: true })
  await writeFile(join(cwd, '.skraft', 'pipeline.skraft.dot'), ejected, 'utf8')
  const { ctx, calls, logs, phases } = simulatedContext({ args: { slug: 'checkout' }, behaviours: [fillsOutputs(), stops()] })

  const outcome = await settled(runSkraftPipelineWorkflow(ctx, copilotHost(cwd)))

  assert.deepEqual(outcome, { paused: 'design-1' })
  assert.deepEqual(calls.map(({ label }) => label.split(' · ')[1]), ['research', 'design'])
  assert.deepEqual((await journalEvents(cwd, 'checkout')).filter((event) => event.type === 'phase.closed').map((event) => event.phase), ['DISCOVER'])
  assert.deepEqual(phases, ['DISCOVER', 'DESIGN'])
  assert.deepEqual(logs.filter((line) => line.startsWith('phase ')), ['phase DISCOVER', 'phase DESIGN'])
})
