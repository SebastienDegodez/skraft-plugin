import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, pipelineHost, scripted, SLUG } from '../support/pipeline-host.mjs'
import { FixedClock, InMemoryRunLock, InMemoryTracking } from '../support/in-memory-host.mjs'

const lease = (owner, since, renewed = since) => `${owner} ${since} ${renewed}\n`
const lockedBy = (since, renewed, expires) => ({
  status: 'refused',
  slug: SLUG,
  phase: null,
  code: 'pipeline-locked',
  reason: `${SLUG} is driven by another session (started ${since}, last seen ${renewed}); let it finish or stop it, or run again after ${expires} if that session is gone`,
})
const OWN_LEASE = 'session-a 2026-10-11T09:00:00.000Z 2026-10-11T09:00:00.000Z\n'
/** An agent that notes the lock file as it stands while it works, then stops on a question. */
const notesTheLock = (seen) => (it) => async (dispatch) => {
  seen.push(it.lock())
  return agent({ result: { status: 'blocked', summary: 'needs a decision' } })(it)(dispatch)
}

test('a second session on a pipeline another session drives is refused, dispatches nothing and writes nothing', async () => {
  const host = pipelineHost()
  await host.init()
  const held = lease('session-b', '2026-10-11T08:58:00.000Z', '2026-10-11T08:59:30.000Z')
  host.tracking.files.set(`${SLUG}/.lock`, held)
  const journal = await host.tracking.lines(SLUG)

  const outcome = await host.run()

  assert.deepEqual(outcome, lockedBy('2026-10-11T08:58:00.000Z', '2026-10-11T08:59:30.000Z', '2026-10-11T09:01:30.000Z'))
  assert.equal(host.agentRunner.dispatches.length, 0)
  assert.deepEqual(await host.tracking.lines(SLUG), journal)
  assert.equal(host.lock(), held)
  assert.equal(host.tracking.files.has(`${SLUG}/run-report.md`), false)
})

test('the run holds the lease while it works and ends it when it stops, blocked or cancelled', async () => {
  const seen = []
  const blocked = scripted({}, (it) => [notesTheLock(seen)(it)])
  await blocked.start()
  assert.deepEqual(seen, [OWN_LEASE])
  assert.equal(blocked.lock(), null)

  const cancelled = scripted({}, () => [async () => { throw new Error('the host cancelled the run') }])
  await cancelled.init()
  await assert.rejects(cancelled.run(), /the host cancelled the run/)
  assert.equal(cancelled.lock(), null)
  assert.deepEqual(cancelled.timer.entries, [])
})

test('a lease its session stopped renewing, or a lock file no session wrote, is taken over without editing a file', async () => {
  const left = [lease('session-b', '2026-10-11T08:50:00.000Z', '2026-10-11T08:58:00.000Z'), 'garbled\n', lease('session-b', 'soon', '2026-10-11T08:59:00.000Z'),
    `${lease('session-b', '2026-10-11T08:59:00.000Z').trim()} more\n`]
  for (const lock of left) {
    const seen = []
    const host = scripted({}, (it) => [notesTheLock(seen)(it)])
    await host.init()
    host.tracking.files.set(`${SLUG}/.lock`, lock)

    await host.run()

    assert.deepEqual(seen, [OWN_LEASE])
    assert.equal(host.lock(), null)
  }
})

/** This session's lock, where a third session writes its own lease just before each write of this one but the first. */
class RacedLock extends InMemoryRunLock {
  constructor(tracking, third) {
    super(tracking)
    this.third = third
    this.writes = 0
  }
  async create(slug, text) { return this.race(slug, () => super.create(slug, text)) }
  async replace(slug, seen, text) { return this.race(slug, () => super.replace(slug, seen, text)) }
  async race(slug, write) {
    this.writes += 1
    if (this.writes > 1) this.tracking.files.set(`${slug}/.lock`, this.third)
    return write()
  }
}

test('two sessions taking over the same gone lease, or a freed one, at once: one drives, the other is refused', async () => {
  const third = lease('session-c', '2026-10-11T09:00:00.000Z')
  for (const left of [lease('session-b', '2026-10-11T08:50:00.000Z'), null]) {
    const host = pipelineHost()
    await host.init()
    host.deps.runLock = new RacedLock(host.tracking, third)
    host.tracking.files.set(`${SLUG}/.lock`, left ?? third)
    // freed: the lease this session's create met is gone when it reads the file
    if (left === null) host.deps.runLock.read = async () => null

    const outcome = await host.run()

    assert.deepEqual(outcome, {
      status: 'refused', slug: SLUG, phase: null, code: 'pipeline-locked',
      reason: `${SLUG}: another session took over the lease a gone session left at the same moment; run again to see which one drives it`,
    })
    assert.equal(host.agentRunner.dispatches.length, 0)
    assert.equal(host.lock(), third)
  }
})

test('the lease is renewed while an agent works long, so a second session is still refused', async () => {
  const tracking = new InMemoryTracking()
  const clock = new FixedClock('2026-10-11T09:00:00.000Z')
  /** @type {any} */
  let second = null
  let periods = []
  const first = scripted({ tracking, clock }, (it) => [async (dispatch) => {
    periods = it.timer.entries.map(({ ms }) => ms)
    for (let period = 0; period < 20; period += 1) {
      clock.advance(30_000)
      await it.timer.tick()
    }
    second = await pipelineHost({ tracking, clock, owner: 'session-b' }).run()
    return agent({ result: { status: 'blocked', summary: 'needs a decision' } })(it)(dispatch)
  }])

  await first.start()

  assert.deepEqual(second, lockedBy('2026-10-11T09:00:00.000Z', '2026-10-11T09:10:00.000Z', '2026-10-11T09:12:00.000Z'))
  assert.deepEqual(periods, [30_000])
  const recorded = first.events().find((event) => event.type === 'step.recorded' && event.step === 'research')
  assert.deepEqual(recorded.documents.filter((path) => !path.startsWith('research/')), [])
  assert.deepEqual(first.timer.entries, [])
  assert.equal(first.lock(), null)
})

const LOST = {
  status: 'blocked', slug: SLUG, phase: null, code: 'lock-lost',
  reason: `${SLUG}: this session no longer holds the pipeline's lease (another session took it over, or renewing it failed); this run stops here and writes nothing more`,
}

test('a session whose lease another session took over writes no more event and leaves the lease alone', async () => {
  const taken = lease('session-b', '2026-10-11T09:20:00.000Z')
  let journal = []
  const host = scripted({}, (it) => [async (dispatch) => {
    it.clock.advance(20 * 60_000)
    it.tracking.files.set(`${SLUG}/.lock`, taken)
    await it.timer.tick()
    journal = await it.tracking.lines(SLUG)
    return agent()(it)(dispatch)
  }])

  const outcome = await host.start()

  assert.deepEqual(outcome, LOST)
  assert.equal(host.agentRunner.dispatches.length, 1)
  assert.equal(host.lock(), taken)
  assert.deepEqual(await host.tracking.lines(SLUG), journal)
  assert.equal(host.events().at(-1).type, 'step.started')
})

test('a lease the machine fails to renew counts as lost, even when a later renewal works', async () => {
  let journal = []
  const host = scripted({}, (it) => [async (dispatch) => {
    const replace = it.deps.runLock.replace
    it.deps.runLock.replace = async () => { throw new Error('EIO: i/o error') }
    await it.timer.tick()
    it.deps.runLock.replace = replace
    await it.timer.tick()
    journal = await it.tracking.lines(SLUG)
    return agent()(it)(dispatch)
  }])

  const outcome = await host.start()

  assert.deepEqual(outcome, LOST)
  assert.deepEqual(await host.tracking.lines(SLUG), journal)
})

test('a lease the machine fails to end leaves the run outcome as it was: the lease expires', async () => {
  const host = scripted({}, (it) => [async (dispatch) => {
    it.deps.runLock.replace = async () => { throw new Error('EIO: i/o error') }
    return agent({ result: { status: 'blocked', summary: 'needs a decision' } })(it)(dispatch)
  }])

  const outcome = await host.start()

  assert.equal(outcome.status, 'blocked')
  assert.equal(host.agentRunner.dispatches.length, 1)
  assert.equal(host.lock(), OWN_LEASE)
})

test('a lock file the machine cannot write or read refuses the run before any agent', async () => {
  for (const port of ['create', 'read']) {
    const host = pipelineHost()
    await host.init()
    host.tracking.files.set(`${SLUG}/.lock`, 'garbled\n')
    host.deps.runLock[port] = async () => { throw new Error('EACCES: permission denied') }

    const outcome = await host.run()

    assert.deepEqual(outcome, {
      status: 'refused', slug: SLUG, phase: null, code: 'lock-unavailable',
      reason: `${SLUG}: this session cannot write the pipeline's lock file (.copilot-tracking/skraft-plans/${SLUG}/.lock); check that the tracking folder is writable and that node starts on this machine`,
    })
    assert.equal(host.agentRunner.dispatches.length, 0)
  }
})
