// Unit tests of the shared pipeline steps: how a run stops (Halt: blocked, awaiting) and how
// it asks the human (checkpoint.mjs), and the state service every pipeline use case writes
// through (pipeline-state.mjs). Hand-written doubles of DecisionStore and HumanInteraction.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Halt, blocked, awaiting, createCheckpoint } from '../../../plugins/skraft-framework/src/application/pipeline/checkpoint.mjs'
import { createPipelineStateService } from '../../../plugins/skraft-framework/src/application/pipeline/pipeline-state.mjs'
import { DEFAULT_PHASE_ORDER } from '../../../plugins/skraft-framework/src/domain/state-machine.mjs'
import { Ok } from '../../../plugins/skraft-framework/src/domain/result.mjs'

const CHECKPOINT = Object.freeze({ key: 'rejected:DESIGN:1', question: 'rework or stop?', options: ['rework', 'stop'] })

// A DecisionStore with what is recorded, and a HumanInteraction that answers `answer`.
const doubles = ({ recorded = {}, answer = null } = {}) => {
  const writes = []
  const asked = []
  const store = new Map(Object.entries(recorded))
  return {
    writes,
    asked,
    decisionStore: {
      read: async (slug, key) => store.get(`${slug}|${key}`) ?? null,
      write: async (...args) => { writes.push(args) },
    },
    humanInteraction: { ask: async (checkpoint) => { asked.push(checkpoint); return answer } },
  }
}

test('checkpoint: blocked carries its detail only when there is one; awaiting carries the checkpoint', () => {
  const plain = blocked('DESIGN', 'stopped by the human')
  assert.ok(plain instanceof Halt)
  assert.ok(plain instanceof Error)
  assert.equal(plain.message, 'stopped by the human')
  assert.deepEqual(plain.outcome, { status: 'blocked', phase: 'DESIGN', reason: 'stopped by the human' })
  assert.ok(!('detail' in plain.outcome))

  assert.deepEqual(blocked('DELIVER', 'retry budget exhausted', 'G1 failed').outcome, {
    status: 'blocked', phase: 'DELIVER', reason: 'retry budget exhausted', detail: 'G1 failed',
  })
  assert.deepEqual(blocked(null, 'refused', [{ code: 'G5' }]).outcome.detail, [{ code: 'G5' }])

  const waiting = awaiting('DESIGN', CHECKPOINT)
  assert.ok(waiting instanceof Halt)
  assert.equal(waiting.message, CHECKPOINT.question)
  assert.deepEqual(waiting.outcome, { status: 'awaiting-human', phase: 'DESIGN', reason: CHECKPOINT.question, checkpoint: CHECKPOINT })
})

test('checkpoint: a recorded answer wins — the human is not asked and nothing is written', async () => {
  const d = doubles({ recorded: { 'shop|rejected:DESIGN:1': 'stop' }, answer: 'rework' })
  const { ask, tryAsk } = createCheckpoint(d)

  assert.equal(await tryAsk('shop', CHECKPOINT), 'stop')
  assert.equal(await ask('shop', 'DESIGN', CHECKPOINT), 'stop')
  assert.deepEqual(d.asked, [])
  assert.deepEqual(d.writes, [])
})

test('checkpoint: an answer given now is trimmed, recorded as the human\'s, and returned', async () => {
  const d = doubles({ answer: '  rework \n' })
  const { tryAsk } = createCheckpoint(d)

  assert.equal(await tryAsk('shop', CHECKPOINT), 'rework')
  assert.deepEqual(d.asked, [CHECKPOINT])
  assert.deepEqual(d.writes, [['shop', 'rejected:DESIGN:1', 'rework', 'human']])
})

test('checkpoint: a non-string answer is recorded as its text', async () => {
  const d = doubles({ answer: 3 })
  const { tryAsk } = createCheckpoint(d)

  assert.equal(await tryAsk('shop', CHECKPOINT), '3')
  assert.deepEqual(d.writes, [['shop', 'rejected:DESIGN:1', '3', 'human']])
})

test('checkpoint: no answer now (null, undefined, blank) is null for tryAsk and awaiting-human for ask — nothing recorded', async () => {
  for (const answer of [null, undefined, '', '   ', '\n\t']) {
    const d = doubles({ answer })
    const { ask, tryAsk } = createCheckpoint(d)

    assert.equal(await tryAsk('shop', CHECKPOINT), null, JSON.stringify(answer))
    await assert.rejects(ask('shop', 'DISTILL', CHECKPOINT), (error) => {
      assert.ok(error instanceof Halt)
      assert.deepEqual(error.outcome, { status: 'awaiting-human', phase: 'DISTILL', reason: CHECKPOINT.question, checkpoint: CHECKPOINT })
      return true
    })
    assert.deepEqual(d.writes, [], JSON.stringify(answer))
  }
})

test('checkpoint: an answer is returned as given by ask once recorded', async () => {
  const d = doubles({ answer: 'stop' })
  const { ask } = createCheckpoint(d)
  assert.equal(await ask('shop', 'DESIGN', CHECKPOINT), 'stop')
  assert.deepEqual(d.writes, [['shop', 'rejected:DESIGN:1', 'stop', 'human']])
})

// ── pipeline-state ──────────────────────────────────────────────────────────

const memoryState = () => {
  const states = new Map()
  return {
    stateReader: {
      read: async (slug) => {
        if (!states.has(slug)) throw Object.assign(new Error('absent'), { code: 'ENOENT' })
        return structuredClone(states.get(slug))
      },
    },
    stateWriter: { write: async (slug, state) => { states.set(slug, structuredClone(state)); return Ok(undefined) } },
    trackingStore: { exists: async () => false, read: async () => null, list: async () => [] },
    sourceControl: {},
  }
}

test('pipeline-state: the published phase order is the one the state service opens with', async () => {
  const order = ['DESIGN', 'DELIVER']
  const { phaseOrder, stateService } = createPipelineStateService({ ...memoryState(), config: { phaseOrder: order } })

  assert.deepEqual(phaseOrder, order)
  const created = await stateService.init('shop')
  assert.equal(created.ok, true)
  assert.equal(created.value.currentPhase, 'DESIGN')
})

test('pipeline-state: without a published phase order, the default one', async () => {
  const { phaseOrder, stateService } = createPipelineStateService({ ...memoryState(), config: {} })

  assert.deepEqual(phaseOrder, DEFAULT_PHASE_ORDER)
  assert.equal((await stateService.init('shop')).value.currentPhase, DEFAULT_PHASE_ORDER[0])
})
