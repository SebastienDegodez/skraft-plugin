import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createReadiness } from '../../../../plugins/skraft-design/engine/application/architecture/readiness.mjs'

const story = (number, ready = true) => ({ number, title: `Story ${number}`, body: 'Approved criteria.', labels: ready ? ['status/ready'] : [], story: true })
const check = (stories) => createReadiness({ architectureForge: {
  read: async (number) => ({ ok: true, issue: story(number) }),
  descendants: async () => ({ ok: true, stories }),
} }).check({ epic: 10 })

test('only ready stories enter design; excluded stories keep their refinement reason', async () => {
  const result = await check([story(42), story(43, false), story(44)])
  assert.equal(result.ok, true)
  assert.deepEqual(result.stories.map(({ number }) => number), [42, 44])
  assert.deepEqual(result.excluded, [{ issue: 43, reason: 'Missing status/ready; use /skraft-refine.' }])
})

test('each architecture pass has at most twenty stories, without dropping the next pass', async () => {
  const result = await check(Array.from({ length: 41 }, (_, index) => story(index + 1)))
  assert.deepEqual(result.batches.map((batch) => batch.length), [20, 20, 1])
  assert.deepEqual(result.batches.flat().map(({ number }) => number), result.stories.map(({ number }) => number))
})

test('an entirely unready scope is refused before any agent runs', async () => {
  assert.equal((await check([story(42, false)])).code, 'story-not-ready')
})

test('a typed epic cannot bypass story admission through the issue input', async () => {
  const result = await createReadiness({ architectureForge: {
    read: async () => ({ ok: true, issue: { ...story(42), story: false } }),
  } }).check({ issue: 42 })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'issue-not-a-story')
})
