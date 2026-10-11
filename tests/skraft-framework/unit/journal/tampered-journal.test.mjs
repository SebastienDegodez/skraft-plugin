import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInit } from '../../../../plugins/skraft-framework/engine/application/init.mjs'
import { createRunPipeline } from '../../../../plugins/skraft-framework/engine/application/run-pipeline.mjs'
import {
  FakeHasher, FixedClock, InMemoryTemplates, InMemoryTracking, RecordingProgress, ScriptedAgentRunner,
} from '../support/in-memory-host.mjs'

const OUTPUT = 'research/2026-10-11/checkout-research.md'

const startedRun = async (behaviours) => {
  const tracking = new InMemoryTracking()
  const agentRunner = new ScriptedAgentRunner(behaviours)
  const deps = {
    journal: tracking,
    activePipeline: tracking,
    files: tracking,
    templates: new InMemoryTemplates({}),
    clock: new FixedClock('2026-10-11T09:00:00.000Z'),
    hasher: new FakeHasher(),
    agentRunner,
    progress: new RecordingProgress(),
  }
  await createInit(deps).init({ slug: 'checkout' })
  return { tracking, agentRunner, deps }
}

const tamperedOutcome = (line, detail) => ({
  status: 'blocked',
  slug: 'checkout',
  phase: null,
  code: 'journal-tampered',
  reason: `journal tampered: events.jsonl line ${line} ${detail}; restore the file or start a new slug`,
})

test('every event carries the hash of the line before it, the first one null', async () => {
  const { tracking, deps } = await startedRun([])
  deps.agentRunner.behaviours.push(() => tracking.write('checkout', OUTPUT, 'Findings.\n'))
  await createRunPipeline(deps).run({ slug: 'checkout' })
  const lines = await tracking.lines('checkout')

  const prevs = tracking.journal('checkout').map((event) => event.prev)

  assert.equal(prevs[0], null)
  assert.deepEqual(prevs.slice(1), await Promise.all(lines.slice(0, -1).map((line) => deps.hasher.sha256(line))))
  assert.deepEqual(Object.keys(tracking.journal('checkout')[0]).slice(0, 3), ['type', 'at', 'prev'])
  assert.equal(tracking.journal('checkout')[0].at, '2026-10-11T09:00:00.000Z')
})

test('an event edited by hand stops the run as tampered, dispatches nothing and writes nothing', async () => {
  const { tracking, agentRunner, deps } = await startedRun([() => undefined])
  agentRunner.behaviours.push(() => undefined)
  await createRunPipeline(deps).run({ slug: 'checkout' })
  tracking.rewriteJournal('checkout', (lines) => lines.map((line) => line.replace('"missing-outputs"', '"outputs-complete"')))
  const before = await tracking.lines('checkout')

  const outcome = await createRunPipeline(deps).run({ slug: 'checkout' })

  assert.deepEqual(outcome, tamperedOutcome(4, 'does not chain to line 3'))
  assert.equal(agentRunner.dispatches.length, 2)
  assert.deepEqual(await tracking.lines('checkout'), before)
})

test('a removed event or an unreadable line breaks the chain too', async () => {
  const removed = await startedRun([() => removed.tracking.write('checkout', OUTPUT, 'Findings.\n')])
  await createRunPipeline(removed.deps).run({ slug: 'checkout' })
  removed.tracking.rewriteJournal('checkout', (lines) => lines.filter((_, index) => index !== 1))
  assert.deepEqual(await createRunPipeline(removed.deps).run({}), tamperedOutcome(2, 'does not chain to line 1'))

  const garbled = await startedRun([])
  garbled.tracking.rewriteJournal('checkout', (lines) => [...lines, '{"type": "phase.closed"'])
  assert.deepEqual(await createRunPipeline(garbled.deps).run({}), tamperedOutcome(2, 'is not JSON'))

  const reordered = await startedRun([])
  reordered.tracking.rewriteJournal('checkout', (lines) => [lines[0].replace('"prev":null', '"prev":"0"')])
  assert.deepEqual(await createRunPipeline(reordered.deps).run({}), tamperedOutcome(1, 'does not open the chain'))
})
