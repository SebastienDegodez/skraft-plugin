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

test('a lease its session stopped renewing, a lock file no session wrote, or one past what a session ever writes, is taken over without editing a file', async () => {
  const left = [lease('session-b', '2026-10-11T08:50:00.000Z', '2026-10-11T08:58:00.000Z'), 'garbled\n', lease('session-b', 'soon', '2026-10-11T08:59:00.000Z'),
    `${lease('session-b', '2026-10-11T08:59:00.000Z').trim()} more\n`, `junk ${lease('session-b', '2026-10-11T08:59:00.000Z')}`,
    `${lease('session-b', '2026-10-11T08:59:00.000Z').trim()} 7200001\n`, lease('session-b', '2026-10-11T08:59:00.000Z', '2026-10-11T09:01:00.001Z')]
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

test('a lease handed over for the longest time, or renewed by a clock up to a minute ahead, is still live', async () => {
  const held = [`${lease('session-b', '2026-10-11T07:00:00.000Z', '2026-10-11T07:00:01.000Z').trim()} 7200000\n`, lease('session-b', '2026-10-11T08:59:00.000Z', '2026-10-11T09:01:00.000Z')]
  for (const lock of held) {
    const host = pipelineHost()
    await host.init()
    host.tracking.files.set(`${SLUG}/.lock`, lock)

    const outcome = await host.run()

    assert.deepEqual([outcome.status, outcome.code], ['refused', 'pipeline-locked'])
    assert.equal(host.lock(), lock)
  }
})

/** This session's lock, where a third session writes its own lease just before each write of this one. */
class RacedLock extends InMemoryRunLock {
  constructor(tracking, third) {
    super(tracking)
    this.third = third
  }
  async create(slug, text) { return this.race(slug, () => super.create(slug, text)) }
  async replace(slug, seen, text) { return this.race(slug, () => super.replace(slug, seen, text)) }
  async race(slug, write) {
    this.tracking.files.set(`${slug}/.lock`, this.third)
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
    // freed: this session reads no lease, and a third session creates its own first
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
  assert.deepEqual(reclaims(first), [])
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

/** The events the run wrote after the researcher started, each as its type and what it says of the lease. */
const afterResearchStarted = (host) => {
  const events = host.events()
  const started = events.findIndex((event) => event.type === 'step.started' && event.step === 'research')
  return events.slice(started + 1).map(({ type, renewed, gapMs }) => (type === 'lease.reclaimed' ? { type, renewed, gapMs } : { type }))
}
const reclaims = (host) => host.events().filter((event) => event.type === 'lease.reclaimed')
/** The designer that comes after the researcher, stopping the run on a question. */
const designerStops = (it) => agent({ result: { status: 'blocked', summary: 'needs a decision' } })(it)

test('a session whose machine slept past its lease, nobody taking it meanwhile, takes it back and records the agent\'s work', async () => {
  const host = scripted({}, (it) => [async (dispatch) => {
    it.clock.sleep(381_400)
    return agent()(it)(dispatch)
  }, designerStops(it)])

  const outcome = await host.start()

  assert.notDeepEqual(outcome, LOST)
  assert.deepEqual(afterResearchStarted(host).slice(0, 2), [
    { type: 'lease.reclaimed', renewed: '2026-10-11T09:00:00.000Z', gapMs: 381_400 },
    { type: 'step.recorded' },
  ])
  assert.equal(reclaims(host).length, 1)
  assert.ok(host.progress.lines.includes(`${SLUG}: this session was paused for 381 s (the machine slept) and nobody took its lease meanwhile; it took it back and goes on`))
  assert.equal(host.lock(), null)
})

test('a session that wakes past its lease\'s renewal time takes it back on its next renewal, its start kept', async () => {
  for (const gap of [110_000, 381_000]) {
    let lock = null
    const host = scripted({}, (it) => [async (dispatch) => {
      it.clock.sleep(gap)
      await it.timer.tick()
      lock = it.lock()
      return agent()(it)(dispatch)
    }, designerStops(it)])

    await host.start()

    assert.equal(lock, `session-a 2026-10-11T09:00:00.000Z ${new Date(Date.parse('2026-10-11T09:00:00.000Z') + gap).toISOString()}\n`)
    assert.deepEqual(reclaims(host).map(({ gapMs }) => gapMs), [gap])
    assert.ok(host.events().some((event) => event.type === 'step.recorded' && event.step === 'research'))
  }
})

test('a renewal and a journal write that both find the lease past its time take it back once', async () => {
  const host = scripted({}, (it) => [async (dispatch) => {
    it.clock.sleep(381_000)
    const replace = it.deps.runLock.replace.bind(it.deps.runLock)
    // a lock write that takes a moment, as a rename on disk does: the journal write comes while the renewal's is under way
    it.deps.runLock.replace = async (...write) => {
      await new Promise((resolve) => { setTimeout(resolve, 10) })
      return replace(...write)
    }
    void it.timer.tick()
    return agent()(it)(dispatch)
  }, designerStops(it)])

  const outcome = await host.start()

  assert.notDeepEqual(outcome, LOST)
  assert.equal(reclaims(host).length, 1)
  assert.ok(host.events().some((event) => event.type === 'step.recorded' && event.step === 'research'))
})

test('a session whose machine slept while the lease changed hands, vanished or was rewritten writes no more event and leaves the lock file as it is', async () => {
  const changes = [
    { lock: lease('session-b', '2026-10-11T09:03:00.000Z'), tick: true },
    { lock: lease('session-b', '2026-10-11T09:03:00.000Z'), tick: false },
    { lock: null, tick: false },
    { lock: lease('session-a', '2026-10-11T09:00:00.000Z', '2026-10-11T09:05:00.000Z'), tick: false },
  ]
  for (const { lock, tick } of changes) {
    let journal = []
    const host = scripted({}, (it) => [async (dispatch) => {
      it.clock.sleep(381_000)
      if (lock === null) it.tracking.files.delete(`${SLUG}/.lock`)
      else it.tracking.files.set(`${SLUG}/.lock`, lock)
      if (tick) await it.timer.tick()
      journal = await it.tracking.lines(SLUG)
      return agent()(it)(dispatch)
    }])

    const outcome = await host.start()

    assert.deepEqual(outcome, LOST)
    assert.equal(host.lock(), lock)
    assert.deepEqual(await host.tracking.lines(SLUG), journal)
  }
})

test('a session that wakes while a third session takes the lease it is taking back writes no more event', async () => {
  const third = lease('session-c', '2026-10-11T09:06:21.000Z')
  let journal = []
  const host = scripted({}, (it) => [async (dispatch) => {
    it.clock.sleep(381_000)
    it.deps.runLock.inGap = (slug) => {
      it.deps.runLock.inGap = null
      it.tracking.files.set(`${slug}/.lock`, third)
    }
    journal = await it.tracking.lines(SLUG)
    return agent()(it)(dispatch)
  }])

  const outcome = await host.start()

  assert.deepEqual(outcome, LOST)
  assert.equal(host.lock(), third)
  assert.deepEqual(await host.tracking.lines(SLUG), journal)
})

test('a session whose machine fails to take its lease back after a sleep writes no more event, even when a later write works', async () => {
  let journal = []
  const host = scripted({}, (it) => [async (dispatch) => {
    it.clock.sleep(381_000)
    const replace = it.deps.runLock.replace
    it.deps.runLock.replace = async () => { throw new Error('EIO: i/o error') }
    await it.timer.tick()
    it.deps.runLock.replace = replace
    journal = await it.tracking.lines(SLUG)
    return agent()(it)(dispatch)
  }])

  const outcome = await host.start()

  assert.deepEqual(outcome, LOST)
  assert.deepEqual(await host.tracking.lines(SLUG), journal)
})

test('a second session under the same id is refused while the first one renews its lease', async () => {
  /** @type {any} */
  let second = null
  const first = scripted({}, (it) => [async (dispatch) => {
    second = await pipelineHost({ tracking: it.tracking, clock: it.clock, owner: 'session-a' }).run()
    return agent({ result: { status: 'blocked', summary: 'needs a decision' } })(it)(dispatch)
  }])

  await first.start()

  assert.deepEqual(second, lockedBy('2026-10-11T09:00:00.000Z', '2026-10-11T09:00:00.000Z', '2026-10-11T09:02:00.000Z'))
  assert.equal(first.agentRunner.dispatches.length, 1)
})

test('a lease the machine fails to renew counts as lost, even when a later renewal works', async () => {
  let journal = []
  const host = scripted({}, (it) => [async (dispatch) => {
    const renew = it.deps.runLock.renew
    it.deps.runLock.renew = async () => { throw new Error('EIO: i/o error') }
    await it.timer.tick()
    it.deps.runLock.renew = renew
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

  assert.deepEqual([outcome.status, outcome.code], ['waiting', 'blocked'])
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
