import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRunPipeline } from '../../../../plugins/skraft-framework/engine/application/pipeline/run-pipeline-usecase.mjs'
import { agent, pipelineHost, SLUG } from '../support/pipeline-host.mjs'

/** The agent loop's hand-over: the runner wrote the dispatches down and stops the run. */
const handOver = (agents) => async () => { throw Object.assign(new Error('handed over to the agent loop'), { handed: agents }) }
const blockedAgent = (host) => agent({ result: { status: 'blocked', summary: 'needs a decision' } })(host)

/** A host whose agent runner hands its dispatches over as the agent loop does. */
const loopHost = (options = {}) => {
  const host = pipelineHost(options)
  host.agentRunner.handedOver = (error) => error.handed ?? null
  return host
}
const run = (host, request = {}) => createRunPipeline(host.deps).run({ slug: SLUG, ...request })
const LOST = {
  status: 'blocked', slug: SLUG, phase: null, code: 'lock-lost',
  reason: `${SLUG}: this session no longer holds the pipeline's lease (another session took it over, or renewing it failed); this run stops here and writes nothing more`,
}

test('a run that hands its agents over keeps its lease for the time they take, 30 minutes each, at most 2 hours', async () => {
  for (const [agents, ttl, expires] of [[1, 1_800_000, '2026-10-11T09:30:00.000Z'], [3, 5_400_000, '2026-10-11T10:30:00.000Z'], [10, 7_200_000, '2026-10-11T11:00:00.000Z']]) {
    const host = loopHost()
    await host.init()
    host.agentRunner.behaviours.push(handOver(agents))

    await assert.rejects(run(host), /handed over to the agent loop/)

    assert.equal(host.lock(), `session-a 2026-10-11T09:00:00.000Z 2026-10-11T09:00:00.000Z ${ttl}\n`)
    assert.deepEqual(host.timer.entries, [])
    host.clock.sleep(ttl - 1)
    const other = await run(pipelineHost({ tracking: host.tracking, clock: host.clock, owner: 'session-b' }))
    assert.equal(other.code, 'pipeline-locked')
    assert.match(other.reason, new RegExp(`run again after ${expires.replace(/\./g, '\\.')} if that session is gone$`))
  }
})

test('the loop takes back its own lease, even past its time when nobody took it, and ends it when the run stops', async () => {
  const host = loopHost()
  await host.init()
  host.agentRunner.behaviours.push(handOver(1))
  await assert.rejects(run(host))
  host.clock.sleep(40 * 60_000)
  const seen = []
  host.agentRunner.behaviours.push(async (dispatch) => {
    seen.push(host.lock())
    host.clock.advance(30_000)
    await host.timer.ticking
    seen.push(host.lock())
    return blockedAgent(host)(dispatch)
  })

  const outcome = await run(host, { handedBack: true })

  assert.equal(outcome.code, 'agent-blocked')
  assert.deepEqual(seen, ['session-a 2026-10-11T09:00:00.000Z 2026-10-11T09:40:00.000Z\n', 'session-a 2026-10-11T09:00:00.000Z 2026-10-11T09:40:30.000Z\n'])
  assert.equal(host.lock(), null)
})

test('a next run again after its pending agents were dropped takes back its own lease, still in its time', async () => {
  const host = loopHost()
  await host.init()
  host.agentRunner.behaviours.push(handOver(1), (dispatch) => blockedAgent(host)(dispatch))
  await assert.rejects(run(host))
  host.clock.sleep(60_000)

  assert.equal((await run(host)).code, 'agent-blocked')
  assert.equal(host.lock(), null)
})

test('a hand-over whose lease the machine fails to write still stops the run as handed over', async () => {
  const host = loopHost()
  await host.init()
  host.agentRunner.behaviours.push(async (dispatch) => {
    host.deps.runLock.renew = async () => { throw new Error('EIO: i/o error') }
    return handOver(1)(dispatch)
  })

  await assert.rejects(run(host), /handed over to the agent loop/)
  assert.equal(host.lock(), 'session-a 2026-10-11T09:00:00.000Z 2026-10-11T09:00:00.000Z\n')
  assert.deepEqual(host.timer.entries, [])
})

test('a hand-over taken back after another session took the lease, or with no lease left, stops as lost and runs nothing', async () => {
  for (const lock of ['session-b 2026-10-11T09:31:00.000Z 2026-10-11T09:31:00.000Z\n', null]) {
    const host = loopHost()
    await host.init()
    host.agentRunner.behaviours.push(handOver(1))
    await assert.rejects(run(host))
    host.clock.sleep(32 * 60_000)
    if (lock === null) host.tracking.files.delete(`${SLUG}/.lock`)
    else host.tracking.files.set(`${SLUG}/.lock`, lock)
    const journal = await host.tracking.lines(SLUG)

    assert.deepEqual(await run(host, { handedBack: true }), LOST)
    assert.equal(host.agentRunner.dispatches.length, 1)
    assert.deepEqual(await host.tracking.lines(SLUG), journal)
    assert.equal(host.lock(), lock)
  }
})

test('the loop takes back its lease in place while in its time, the way a gone session\'s is past it', async () => {
  const third = 'session-c 2026-10-11T09:45:00.000Z 2026-10-11T09:45:00.000Z\n'
  for (const [asleep, outcome, seen] of [[20 * 60_000, 'agent-blocked', ['session-a 2026-10-11T09:00:00.000Z 2026-10-11T09:20:00.000Z\n']], [45 * 60_000, 'lock-lost', []]]) {
    const host = loopHost()
    await host.init()
    const during = []
    host.agentRunner.behaviours.push(handOver(1), (dispatch) => {
      during.push(host.lock())
      return blockedAgent(host)(dispatch)
    })
    await assert.rejects(run(host))
    host.clock.sleep(asleep)
    host.deps.runLock.inGap = (slug) => {
      host.deps.runLock.inGap = null
      host.tracking.files.set(`${slug}/.lock`, third)
    }

    assert.equal((await run(host, { handedBack: true })).code, outcome)
    assert.deepEqual(during, seen)
  }
})

test('a take-back while the same id drives the run on its renewed lease is refused, and the runner hears of a lease held only', async () => {
  const host = loopHost()
  await host.init()
  const held = []
  host.agentRunner.held = async () => { held.push(host.lock()) }
  host.agentRunner.behaviours.push(handOver(1))
  await assert.rejects(run(host))
  host.tracking.files.set(`${SLUG}/.lock`, 'session-a 2026-10-11T09:00:00.000Z 2026-10-11T09:00:00.000Z\n')

  const second = await run(host, { handedBack: true })

  assert.deepEqual([second.status, second.code], ['refused', 'pipeline-locked'])
  assert.deepEqual(held, ['session-a 2026-10-11T09:00:00.000Z 2026-10-11T09:00:00.000Z\n'])
  assert.equal(host.agentRunner.dispatches.length, 1)
})
