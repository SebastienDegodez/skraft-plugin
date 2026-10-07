// Use-case tests of RunPipeline (src/application/pipeline/run-pipeline.mjs) at its edges:
// the exact transcript a run leaves, the refusals of every driven port, the reviewer that
// writes nothing, the checkpoints (rejected, environment, ADR ratification) and the guards.
// Driven through the in-memory host of fake-host.mjs; a test that needs a port to misbehave
// wraps that one port by hand.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRunPipeline } from '../../../plugins/skraft-framework/src/application/pipeline/run-pipeline.mjs'
import { createFakeHost, CONFIG, TODAY, review, ADR_INDEX_HEADER } from './fake-host.mjs'

const SLUG = 'checkout'
const STORY = { issue: 42, title: 'Pay by card' }
const P = CONFIG.phaseAgents
const PREFIX = `.copilot-tracking/skraft-plans/${SLUG}/`

const run = (dependencies, options = {}) => createRunPipeline(dependencies).run({ slug: SLUG, story: STORY, ...options })
const runOnce = (host, options = {}) => run(host.dependencies(SLUG), options)

// A fresh, healthy state.json on disk (the run stops before its first phase).
const seeded = async (options = {}) => {
  const host = createFakeHost(options)
  const outcome = await runOnce(host, { maxPhases: 0 })
  assert.deepEqual(outcome, { status: 'blocked', phase: null, reason: 'phase guard reached' })
  return host
}

const caught = async (promise) => {
  try {
    await promise
  } catch (error) {
    return { error }
  }
  return null
}

const journalOf = (host) => JSON.parse(host.tracking(SLUG, 'run.json'))
const adrIndex = (...rows) => `${ADR_INDEX_HEADER}${rows.map(([adr, title]) => `| ${adr} | ${title} | Proposed | x | y | — | ${TODAY} |\n`).join('')}`

// ── The transcript ───────────────────────────────────────────────────────────

test('run-pipeline edges: a run with one rework leaves the exact dispatch labels, log lines and outcome', async () => {
  const host = createFakeHost({ reviews: { DISTILL: [review('NEEDS_REWORK', { findings: 'F1: scenario 2 has no Then' })] } })
  const dependencies = host.dependencies(SLUG)
  const events = []
  const { write } = dependencies.stateWriter
  dependencies.stateWriter = { write: (slug, state) => { events.push('write'); return write(slug, state) } }
  const runner = dependencies.agentRunner.run
  dependencies.agentRunner = { run: (dispatch) => { events.push(dispatch.label); return runner(dispatch) } }

  const outcome = await run(dependencies)

  assert.deepEqual(outcome, { status: 'done', phase: 'DONE', reason: 'every phase approved' })
  assert.deepEqual(host.dispatches.map((d) => d.label), [
    'RESEARCH:specialist:0:0:',
    'DESIGN:specialist:0:0:',
    'DESIGN:reviewer:1',
    'DISTILL:specialist:0:0:',
    'DISTILL:reviewer:1',
    'DISTILL:specialist:1:1:Reviewer findings (attempt 2 of 3)',
    'DISTILL:reviewer:2',
    'DELIVER:specialist:0:0:',
    'DELIVER:reviewer:1',
  ])
  assert.deepEqual(host.logs, [
    'reporting: local',
    `→ ${P.RESEARCH.specialist} (first-pass, attempt 1/3)`,
    'RESEARCH closed (no reviewer) → DESIGN',
    `structural scan recorded: details/${TODAY}/structural-scan.json`,
    `→ ${P.DESIGN.specialist} (first-pass, attempt 1/3)`,
    `→ ${P.DESIGN.reviewer} (first-pass, attempt 1/3)`,
    `${P.DESIGN.reviewer}: APPROVED`,
    'DESIGN closed → DISTILL',
    `→ ${P.DISTILL.specialist} (first-pass, attempt 1/3)`,
    `→ ${P.DISTILL.reviewer} (first-pass, attempt 1/3)`,
    `${P.DISTILL.reviewer}: NEEDS_REWORK`,
    `→ ${P.DISTILL.specialist} (rework, attempt 2/3)`,
    `→ ${P.DISTILL.reviewer} (re-review, attempt 2/3)`,
    `${P.DISTILL.reviewer}: APPROVED`,
    'forecast report: no forecast data was written; nothing rendered',
    'DISTILL closed → DELIVER',
    `→ ${P.DELIVER.specialist} (first-pass, attempt 1/3)`,
    `qg-verify evidence/${TODAY}/s1/qg-s1.json: pass`,
    `→ ${P.DELIVER.reviewer} (first-pass, attempt 1/3)`,
    `${P.DELIVER.reviewer}: APPROVED`,
    'outcome report: no outcome data was written; nothing rendered',
    'DELIVER closed → DONE',
    'checkout: pipeline DONE',
  ])
  // DESIGN found no ADR to ratify: the checkpoint is resolved with nothing pending.
  assert.deepEqual(host.state(SLUG).adrRatification, { checkpointStatus: 'resolved', pending: [], ratified: [] })
  // The rework rewrote the same artefacts: nothing new to record, state.json untouched.
  const rework = events.indexOf('DISTILL:specialist:1:1:Reviewer findings (attempt 2 of 3)')
  assert.deepEqual(events.slice(rework + 1, events.indexOf('DISTILL:reviewer:2')), [])
})

test('run-pipeline edges: only reviewers are told where to write; only DISTILL and DELIVER specialists get the reporting section', async () => {
  const host = createFakeHost()
  await runOnce(host)

  for (const { role, phase, prompt, agent } of host.dispatches) {
    assert.ok(!prompt.includes('## undefined'), `${agent}: no empty addendum`)
    if (role === 'reviewer') {
      assert.match(prompt, new RegExp(`- Write your output exactly at:\\n  - \`\\.copilot-tracking/skraft-plans/checkout/reviews/${TODAY}/${phase.toLowerCase()}-review-1\\.md\``))
      assert.ok(!prompt.includes('## Reporting'), `${agent}: a reviewer gets no reporting addendum`)
    } else {
      assert.ok(!prompt.includes('Write your output exactly at'), `${agent}: a specialist chooses its own dated paths`)
      assert.equal(prompt.includes('## Reporting (qa-reporting)'), phase === 'DISTILL' || phase === 'DELIVER', agent)
    }
  }
})

test('run-pipeline edges: maxPhases stops the run at the phase guard, before DESIGN ever ratifies', async () => {
  const host = createFakeHost()
  const outcome = await runOnce(host, { maxPhases: 1 })

  assert.deepEqual(outcome, { status: 'blocked', phase: null, reason: 'phase guard reached' })
  assert.equal(host.state(SLUG).currentPhase, 'DESIGN')
  assert.equal(host.state(SLUG).adrRatification.checkpointStatus, 'none')
  assert.deepEqual(host.agentsCalled(), [P.RESEARCH.specialist])
})

// ── Refusals of the state ────────────────────────────────────────────────────

test('run-pipeline edges: a state.json that becomes unreadable mid-run blocks the run, saying why', async () => {
  const host = createFakeHost()
  const dependencies = host.dependencies(SLUG)
  let broken = false
  const { read } = dependencies.stateReader
  dependencies.stateReader = {
    read: async (slug) => {
      if (broken) throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
      return read(slug)
    },
  }
  const runner = dependencies.agentRunner.run
  dependencies.agentRunner = { run: async (dispatch) => { broken = true; return runner(dispatch) } }

  const outcome = await run(dependencies)

  assert.deepEqual(outcome, { status: 'blocked', phase: null, reason: 'state.json unreadable: IO_ERROR' })
  assert.equal(journalOf(host).status, 'blocked')
})

test('run-pipeline edges: a state that cannot be initialised after recovery blocks before the pipeline is marked active', async () => {
  const host = await seeded()
  const dependencies = host.dependencies(SLUG)
  let reads = 0
  const { read } = dependencies.stateReader
  // Recovery reads a healthy state; the init right after it cannot read it any more.
  dependencies.stateReader = {
    read: async (slug) => {
      reads += 1
      if (reads === 2) throw Object.assign(new Error('EIO: i/o error'), { code: 'EIO' })
      return read(slug)
    },
  }
  const activationsBefore = host.activations.length

  const outcome = await run(dependencies)

  assert.deepEqual(outcome, { status: 'blocked', phase: null, reason: 'state.json for checkout: IO_ERROR' })
  assert.equal(host.activations.length, activationsBefore)
  assert.deepEqual(host.dispatches, [])
})

test('run-pipeline edges: a state the schema refuses at dispatch time never reaches the agent', async () => {
  const host = createFakeHost()
  const dependencies = host.dependencies(SLUG)
  const { read } = dependencies.stateReader
  // Once RESEARCH is marked started, the stored verdict reads as something no schema allows.
  dependencies.stateReader = {
    read: async (slug) => {
      const state = await read(slug)
      return state.phaseHistory?.RESEARCH ? { ...state, verdicts: { ...state.verdicts, RESEARCH: 'MAYBE' } } : state
    },
  }

  const outcome = await run(dependencies)

  assert.equal(outcome.status, 'blocked')
  assert.equal(outcome.phase, 'RESEARCH')
  assert.match(outcome.reason, /^cannot dispatch Skraft - Solution Researcher: .+/)
  assert.deepEqual(host.dispatches, [])
})

test('run-pipeline edges: a refusal of the state service is returned as blocked with its code and reason', async () => {
  for (const [error, reason] of [
    [{ code: 'EIO', reason: 'disk full' }, 'EIO: disk full'],
    [{ code: 'EIO', message: 'read-only file system' }, 'EIO: read-only file system'],
    [{ code: 'EIO' }, 'EIO: '],
  ]) {
    const host = createFakeHost({ verdicts: { DESIGN: ['NEEDS_REWORK'] } })
    const dependencies = host.dependencies(SLUG)
    const { write } = dependencies.stateWriter
    // The write that spends DESIGN's first retry is refused.
    dependencies.stateWriter = { write: (slug, state) => (state.retryCount?.DESIGN === 1 ? { ok: false, error } : write(slug, state)) }

    const outcome = await run(dependencies)

    assert.deepEqual(outcome, { status: 'blocked', phase: null, reason })
    assert.equal(host.dispatches.filter((d) => d.agent === P.DESIGN.specialist).length, 1, 'no rework after the refusal')
  }
})

test('run-pipeline edges: a refusal in DELIVER that is not a halt renders no outcome report', async () => {
  const host = createFakeHost({ gates: ['fail', 'pass'], consent: 'chat', reportData: { outcome: { kind: 'outcome' } } })
  const dependencies = host.dependencies(SLUG)
  const { write } = dependencies.stateWriter
  dependencies.stateWriter = { write: (slug, state) => (state.retryCount?.DELIVER === 1 ? { ok: false, error: { code: 'EIO', reason: 'disk full' } } : write(slug, state)) }

  const outcome = await run(dependencies)

  assert.deepEqual(outcome, { status: 'blocked', phase: null, reason: 'EIO: disk full' })
  assert.ok(!host.logs.some((line) => line.startsWith('outcome report')), host.logs.join('\n'))
})

test('run-pipeline edges: a phase whose closure is refused is blocked at that phase, with the refusal and its violations', async () => {
  const cases = [
    [{ code: 'EIO', reason: 'disk full' }, { status: 'blocked', phase: 'DESIGN', reason: 'DESIGN cannot close: disk full' }],
    [{ code: 'EIO', message: 'read-only file system' }, { status: 'blocked', phase: 'DESIGN', reason: 'DESIGN cannot close: read-only file system' }],
    [{ code: 'PHASE_GATE', reason: 'G5 — no review', violations: [{ code: 'G5' }] }, { status: 'blocked', phase: 'DESIGN', reason: 'DESIGN cannot close: G5 — no review', detail: [{ code: 'G5' }] }],
  ]
  for (const [error, expected] of cases) {
    const host = createFakeHost()
    const dependencies = host.dependencies(SLUG)
    const { write } = dependencies.stateWriter
    dependencies.stateWriter = { write: (slug, state) => (state.currentPhase === 'DISTILL' ? { ok: false, error } : write(slug, state)) }

    const outcome = await run(dependencies)

    assert.deepEqual(outcome, expected)
    assert.ok(!host.logs.includes('DESIGN closed → DISTILL'))
  }
})

// ── Errors that belong to the host ─────────────────────────────────────────────

test('run-pipeline edges: an Error a port throws is the host\'s — rethrown as is, the journal finished as error', async () => {
  const host = createFakeHost()
  const dependencies = host.dependencies(SLUG)
  const cancelled = Object.assign(new Error('cancelled by the user'), { code: 'ECANCELED' })
  dependencies.agentRunner = { run: async () => { throw cancelled } }

  const result = await caught(run(dependencies))

  assert.equal(result?.error, cancelled)
  const journal = journalOf(host)
  assert.equal(journal.status, 'error')
  assert.equal(journal.reason, 'cancelled by the user')
})

test('run-pipeline edges: a thrown object without a string code is not mistaken for a state refusal', async () => {
  const host = createFakeHost()
  const dependencies = host.dependencies(SLUG)
  const odd = { code: 7 }
  dependencies.agentRunner = { run: async () => { throw odd } }

  const result = await caught(run(dependencies))

  assert.equal(result?.error, odd)
  assert.equal(journalOf(host).status, 'error')
})

test('run-pipeline edges: a host pause (AbortError) is rethrown and leaves the journal running', async () => {
  const host = createFakeHost()
  const dependencies = host.dependencies(SLUG)
  const pause = Object.assign(new Error('paused'), { name: 'AbortError' })
  dependencies.agentRunner = { run: async () => { throw pause } }

  const result = await caught(run(dependencies))

  assert.equal(result?.error, pause)
  assert.equal(journalOf(host).status, 'running')
})

test('run-pipeline edges: even a bare `throw undefined` from a port is rethrown, the journal saying so', async () => {
  const host = createFakeHost()
  const dependencies = host.dependencies(SLUG)
  dependencies.agentRunner = { run: async () => { throw undefined } }

  const result = await caught(run(dependencies))

  assert.ok(result, 'the run rejects')
  assert.equal(result.error, undefined)
  const journal = journalOf(host)
  assert.equal(journal.status, 'error')
  assert.equal(journal.reason, 'undefined')
})

// ── Configuration ────────────────────────────────────────────────────────────

test('run-pipeline edges: a phase with no specialist in the config is blocked at that phase', async () => {
  const { RESEARCH: _research, ...withoutResearch } = CONFIG.phaseAgents
  const { phaseAgents: _agents, ...withoutAgents } = CONFIG
  for (const config of [{ ...CONFIG, phaseAgents: withoutResearch }, withoutAgents]) {
    const host = createFakeHost()
    const outcome = await run({ ...host.dependencies(SLUG), config })

    assert.deepEqual(outcome, { status: 'blocked', phase: 'RESEARCH', reason: 'RESEARCH has no specialist in skraft-framework.config.json' })
    assert.deepEqual(host.dispatches, [])
    assert.deepEqual(host.phases, [])
  }
})

test('run-pipeline edges: an agent the handoff policy does not govern cannot be handed off to', async () => {
  const { phaseOrder: _order, ...config } = CONFIG
  const host = createFakeHost()
  const outcome = await run({ ...host.dependencies(SLUG), config })

  assert.deepEqual(outcome, {
    status: 'blocked',
    phase: 'RESEARCH',
    reason: `cannot hand off to ${P.RESEARCH.specialist}: ${P.RESEARCH.specialist} is not a pipeline phase agent; its dispatcher supplies its inputs`,
  })
  assert.deepEqual(host.dispatches, [])
})

// ── Agents that answer badly ──────────────────────────────────────────────────

test('run-pipeline edges: an unavailable agent with no message of its own is named by the run', async () => {
  const host = createFakeHost()
  const dependencies = host.dependencies(SLUG)
  dependencies.agentRunner = { run: async () => ({ ok: false, unavailable: true }) }

  const outcome = await run(dependencies)

  assert.deepEqual(outcome, { status: 'blocked', phase: 'RESEARCH', reason: `${P.RESEARCH.specialist} is not available on this host` })
})

test('run-pipeline edges: an agent that returns no answer is logged, with its error when it gives one, and the run goes on', async () => {
  for (const [answer, line] of [
    [undefined, `  ${P.RESEARCH.specialist} returned no answer`],
    [{ ok: false, error: 'quota exceeded' }, `  ${P.RESEARCH.specialist} returned no answer — quota exceeded`],
    [{ ok: false, text: '' }, `  ${P.RESEARCH.specialist} returned no answer`],
  ]) {
    const host = createFakeHost()
    const dependencies = host.dependencies(SLUG)
    const runner = dependencies.agentRunner.run
    dependencies.agentRunner = { run: async (dispatch) => { await runner(dispatch); return answer } }

    const outcome = await run(dependencies, { maxPhases: 1 })

    assert.deepEqual(outcome, { status: 'blocked', phase: null, reason: 'phase guard reached' })
    assert.deepEqual(host.logs.filter((l) => l.includes('returned no answer')), [line])
    assert.equal(host.state(SLUG).currentPhase, 'DESIGN')
  }
})

test('run-pipeline edges: an agent that answers keeps the log free of "no answer" lines', async () => {
  const host = createFakeHost()
  await runOnce(host)
  assert.deepEqual(host.logs.filter((l) => l.includes('returned no answer')), [])
})

test('run-pipeline edges: only the acceptance designer\'s own answer is kept as the DISTILL handoff', async () => {
  const handoff = `reporting/${TODAY}/distill-handoff.md`
  const answering = (answerOf) => {
    const host = createFakeHost()
    const dependencies = host.dependencies(SLUG)
    const runner = dependencies.agentRunner.run
    dependencies.agentRunner = { run: async (dispatch) => { await runner(dispatch); return answerOf(dispatch) } }
    return { host, dependencies }
  }

  const named = answering(({ agent }) => ({ ok: true, text: `answer of ${agent}` }))
  assert.equal((await run(named.dependencies)).status, 'done')
  assert.equal(named.host.tracking(SLUG, handoff), `answer of ${P.DISTILL.specialist}`)

  const failed = answering(({ agent }) => ({ ok: agent !== P.DISTILL.specialist, text: `answer of ${agent}` }))
  assert.equal((await run(failed.dependencies)).status, 'done')
  assert.equal(failed.host.tracking(SLUG, handoff), undefined)

  const silent = answering(({ agent }) => (agent === P.DISTILL.specialist ? undefined : { ok: true, text: `answer of ${agent}` }))
  assert.equal((await run(silent.dependencies)).status, 'done')
  assert.equal(silent.host.tracking(SLUG, handoff), undefined)
})

// ── The reviewer ──────────────────────────────────────────────────────────────

// A host whose DESIGN reviewer writes nothing on its first `silent` dispatches.
const silentReviewer = (silent, options = {}) => {
  const host = createFakeHost(options)
  const dependencies = host.dependencies(SLUG)
  const labels = []
  let reviews = 0
  const runner = dependencies.agentRunner.run
  dependencies.agentRunner = {
    run: async (dispatch) => {
      labels.push(dispatch.label)
      if (dispatch.agent === P.DESIGN.reviewer) {
        reviews += 1
        if (reviews <= silent) return { ok: true, text: 'reviewed (in chat only)' }
      }
      return runner(dispatch)
    },
  }
  return { host, dependencies, labels }
}

test('run-pipeline edges: a reviewer that writes no review twice blocks the phase, naming the path', async () => {
  const { host, dependencies, labels } = silentReviewer(2)
  const outcome = await run(dependencies)

  assert.deepEqual(outcome, {
    status: 'blocked',
    phase: 'DESIGN',
    reason: `${P.DESIGN.reviewer} wrote no review at reviews/${TODAY}/design-review-1.md`,
  })
  assert.deepEqual(labels.filter((l) => l.startsWith('DESIGN:reviewer')), ['DESIGN:reviewer:1', 'DESIGN:reviewer:1:again'])
  assert.equal(host.state(SLUG).reviewArtifacts.DESIGN, undefined)
})

test('run-pipeline edges: a reviewer asked again writes its review; the next review is a first ask again', async () => {
  const { host, dependencies, labels } = silentReviewer(1, { verdicts: { DESIGN: ['NEEDS_REWORK', 'APPROVED'] } })
  const outcome = await run(dependencies)

  assert.equal(outcome.status, 'done')
  assert.deepEqual(labels.filter((l) => l.startsWith('DESIGN:reviewer')), ['DESIGN:reviewer:1', 'DESIGN:reviewer:1:again', 'DESIGN:reviewer:2'])
  assert.deepEqual(host.state(SLUG).reviewArtifacts.DESIGN, [`reviews/${TODAY}/design-review-1.md`, `reviews/${TODAY}/design-review-2.md`])
})

test('run-pipeline edges: a review with no parseable verdict blocks the phase and is logged as such', async () => {
  const host = createFakeHost({ reviews: { DESIGN: ['# Review\n\nLooks fine to me.'] } })
  const outcome = await runOnce(host)

  assert.deepEqual(outcome, { status: 'blocked', phase: 'DESIGN', reason: `reviews/${TODAY}/design-review-1.md carries no parseable verdict` })
  assert.ok(host.logs.includes(`${P.DESIGN.reviewer}: no verdict`), host.logs.join('\n'))
  assert.equal(host.state(SLUG).verdicts.DESIGN, undefined)
})

// ── Rejected and environment checkpoints ──────────────────────────────────────

test('run-pipeline edges: a REJECTED phase asks rework-or-stop; DESIGN adds the G13 hint, "stop" blocks without an outcome report', async () => {
  const design = createFakeHost({ verdicts: { DESIGN: ['REJECTED'] } })
  const paused = await runOnce(design)
  assert.equal(paused.checkpoint.question,
    `${P.DESIGN.reviewer} REJECTED DESIGN. Resolve the blocker (for G13: write the -resolution.md beside the decision-drift file), then answer "rework" to retry, or "stop".`)

  const distill = createFakeHost({ verdicts: { DISTILL: ['REJECTED'] }, answers: { 'rejected:DISTILL': ['stop'] } })
  const stopped = await runOnce(distill)
  assert.deepEqual(stopped, { status: 'blocked', phase: 'DISTILL', reason: 'DISTILL rejected; stopped by the human' })
  assert.deepEqual(distill.questions.map((q) => q.question), [
    `${P.DISTILL.reviewer} REJECTED DISTILL. Resolve the blocker, then answer "rework" to retry, or "stop".`,
  ])
  assert.ok(!distill.logs.some((line) => line.startsWith('outcome report')), distill.logs.join('\n'))
})

test('run-pipeline edges: an environment escalation is logged, keyed by review, retry and occurrence, and "stop" blocks', async () => {
  const host = createFakeHost({
    reviews: { DESIGN: [review('NEEDS_REWORK', { escalation: 'environment', findings: 'dotnet SDK missing' })] },
    answers: { 'environment:DESIGN': ['stop'] },
  })
  const outcome = await runOnce(host)

  assert.deepEqual(outcome, { status: 'blocked', phase: 'DESIGN', reason: 'environment escalation; stopped by the human' })
  assert.ok(host.logs.includes(`${P.DESIGN.reviewer}: NEEDS_REWORK (escalation: environment)`), host.logs.join('\n'))
  assert.equal(host.questions.length, 1)
  assert.equal(host.questions[0].key, 'environment:DESIGN:review:r1:t0:n1')
  assert.deepEqual(host.questions[0].options, ['fixed', 'stop'])
})

test('run-pipeline edges: environment checkpoints count their occurrences and the retries already spent', async () => {
  const twice = createFakeHost({ gates: ['inconclusive', 'inconclusive', 'pass'], answers: { 'environment:DELIVER': ['FIXED', 'fixed'] } })
  assert.equal((await runOnce(twice)).status, 'done')
  assert.deepEqual(twice.questions.map((q) => q.key), ['environment:DELIVER:qg-verify:r0:t0:n1', 'environment:DELIVER:qg-verify:r0:t0:n2'])

  const afterRetry = createFakeHost({
    reviews: { DESIGN: [review('NEEDS_REWORK', { findings: 'F1' }), review('NEEDS_REWORK', { escalation: 'environment', findings: 'SDK gone' })] },
  })
  const outcome = await runOnce(afterRetry)
  assert.equal(outcome.status, 'awaiting-human')
  assert.equal(outcome.phase, 'DESIGN')
  assert.equal(outcome.checkpoint.key, 'environment:DESIGN:review:r2:t1:n1')
  assert.deepEqual(outcome.checkpoint.options, ['fixed', 'stop'])
})

test('run-pipeline edges: an awaiting DELIVER renders no outcome report', async () => {
  const host = createFakeHost({ gates: ['inconclusive'], consent: 'chat', reportData: { outcome: { kind: 'outcome' } } })
  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'awaiting-human')
  assert.ok(!host.logs.some((line) => line.startsWith('outcome report')), host.logs.join('\n'))
  assert.equal(host.tracking(SLUG, `reporting/${TODAY}/outcome.md`), undefined)
})

// ── Quality gates of DELIVER ───────────────────────────────────────────────────

// The DELIVER verdict state.json holds when each engineer dispatch starts.
const verdictsAtEngineer = (options) => {
  const host = createFakeHost(options)
  const dependencies = host.dependencies(SLUG)
  const seen = []
  const runner = dependencies.agentRunner.run
  dependencies.agentRunner = {
    run: async (dispatch) => {
      if (dispatch.agent === P.DELIVER.specialist) seen.push(host.state(SLUG).verdicts.DELIVER ?? null)
      return runner(dispatch)
    },
  }
  return { host, dependencies, seen }
}

test('run-pipeline edges: failed gates record CHANGES_REQUESTED before the rework; an environment re-gate records nothing', async () => {
  const failed = verdictsAtEngineer({ gates: ['fail', 'pass'] })
  assert.equal((await run(failed.dependencies)).status, 'done')
  assert.deepEqual(failed.seen, [null, 'CHANGES_REQUESTED'])

  const environment = verdictsAtEngineer({ gates: ['inconclusive', 'pass'], answers: { 'environment:DELIVER': ['fixed'] } })
  assert.equal((await run(environment.dependencies)).status, 'done')
  assert.deepEqual(environment.seen, [null, null])
})

test('run-pipeline edges: an engineer that leaves no evidence log fails the gates, attempt after attempt, until the budget is spent', async () => {
  const host = createFakeHost()
  const dependencies = host.dependencies(SLUG)
  // A config whose engineer declares no evidence log: its outputs are complete without one.
  const config = structuredClone(CONFIG)
  config.agentArtifacts[P.DELIVER.specialist].outputs = config.agentArtifacts[P.DELIVER.specialist].outputs.filter((entry) => !entry.includes('/evidence/'))
  dependencies.config = config
  const { list } = dependencies.trackingStore
  dependencies.trackingStore = { ...dependencies.trackingStore, list: async (slug) => (await list(slug)).filter((path) => !path.startsWith('evidence/')) }
  const findings = 'qg-verify failed — fix these before review:\nNo quality-gate evidence log (evidence/{date}/{story}/qg-{story}.json) was produced.'

  const outcome = await run(dependencies)

  assert.deepEqual(outcome, {
    status: 'blocked',
    phase: 'DELIVER',
    reason: 'retry budget exhausted (3 attempts); last findings attached',
    detail: findings,
  })
  const engineer = host.dispatches.filter((d) => d.agent === P.DELIVER.specialist)
  assert.equal(engineer.length, 3)
  assert.ok(engineer[1].prompt.includes(findings))
  assert.equal(host.dispatches.filter((d) => d.agent === P.DELIVER.reviewer).length, 0)
})

test('run-pipeline edges: an evidence check that cannot run asks the human about the environment, saying why', async () => {
  for (const [thrown, why] of [[new Error('git broke'), 'git broke'], [null, 'null']]) {
    const host = createFakeHost()
    const dependencies = host.dependencies(SLUG)
    dependencies.sourceControl = { ...dependencies.sourceControl, range: async () => { throw thrown } }

    const outcome = await run(dependencies)

    const question = `DELIVER is blocked by the environment, not by the code:\nthe evidence check could not run: ${why}\nFix the environment, then answer "fixed" (or "stop").`
    assert.deepEqual(outcome, {
      status: 'awaiting-human',
      phase: 'DELIVER',
      reason: question,
      checkpoint: { key: 'environment:DELIVER:qg-verify:r0:t0:n1', question, options: ['fixed', 'stop'] },
    })
  }
})

test('run-pipeline edges: evidence a log cites that is not on disk is a missing reference (STDOUT_MISSING), not a crash', async () => {
  const host = createFakeHost({ gates: ['inconclusive'] })
  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'awaiting-human')
  const findings = JSON.parse(outcome.checkpoint.question.split('\n').slice(1, -1).join('\n'))
  assert.deepEqual(findings, [{
    severity: 'inconclusive',
    code: 'STDOUT_MISSING',
    detail: `G1 stdout evidence/${TODAY}/s1/G1.out is not on disk`,
    gate: 'G1',
  }])
})

test('run-pipeline edges: an evidence log recorded but no longer on disk is LOG_MISSING, an environment question', async () => {
  const host = createFakeHost()
  const dependencies = host.dependencies(SLUG)
  const reader = dependencies.repositoryReader.read
  dependencies.repositoryReader = { read: async (path) => (path.endsWith('/qg-s1.json') ? null : reader(path)) }

  const outcome = await run(dependencies)

  assert.equal(outcome.status, 'awaiting-human')
  assert.equal(outcome.checkpoint.key, 'environment:DELIVER:qg-verify:r0:t0:n1')
  const findings = JSON.parse(outcome.checkpoint.question.split('\n').slice(1, -1).join('\n'))
  assert.deepEqual(findings, [{ severity: 'inconclusive', code: 'LOG_MISSING', detail: `${PREFIX}evidence/${TODAY}/s1/qg-s1.json is not on disk` }])
})

// ── Retry budgets and resuming ─────────────────────────────────────────────────

test('run-pipeline edges: the retry budget follows the maxRetriesPerPhase state.json records', async () => {
  const host = await seeded({ verdicts: { DESIGN: ['NEEDS_REWORK', 'NEEDS_REWORK', 'NEEDS_REWORK', 'NEEDS_REWORK'] } })
  host.state(SLUG).userPreferences.maxRetriesPerPhase = 3

  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'blocked')
  assert.equal(outcome.phase, 'DESIGN')
  assert.equal(outcome.reason, 'retry budget exhausted (4 attempts); last findings attached')
  assert.equal(outcome.detail, host.tracking(SLUG, `reviews/${TODAY}/design-review-4.md`))
  assert.deepEqual(host.dispatches.filter((d) => d.agent === P.DESIGN.specialist).map((d) => d.label), [
    'DESIGN:specialist:0:0:',
    'DESIGN:specialist:1:1:Reviewer findings (attempt 2 of 4)',
    'DESIGN:specialist:2:2:Reviewer findings (attempt 3 of 4)',
    'DESIGN:specialist:3:3:Reviewer findings (attempt 4 of 4)',
  ])
})

test('run-pipeline edges: a phase re-entered on CHANGES_REQUESTED reworks from its last review with the next attempt number', async () => {
  const host = createFakeHost({ reviews: { DISTILL: [review('NEEDS_REWORK', { findings: 'F7: no edge case' })] } })
  const dependencies = host.dependencies(SLUG)
  const { write } = dependencies.stateWriter
  // The run stops (a refused write) right after the review was recorded, before the retry is spent.
  dependencies.stateWriter = { write: (slug, state) => (state.retryCount?.DISTILL === 1 ? { ok: false, error: { code: 'EIO', reason: 'disk full' } } : write(slug, state)) }
  assert.deepEqual(await run(dependencies), { status: 'blocked', phase: null, reason: 'EIO: disk full' })
  const state = host.state(SLUG)
  assert.equal(state.verdicts.DISTILL, 'CHANGES_REQUESTED')
  state.retryCount.DISTILL = 1
  state.userPreferences.maxRetriesPerPhase = 3
  const before = host.dispatches.length

  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'done')
  const resumed = host.dispatches.slice(before)
  assert.equal(resumed[0].label, 'DISTILL:specialist:1:1:Reviewer findings (attempt 2 of 4)')
  assert.match(resumed[0].prompt, /F7: no edge case/)
})

// ── Structural scan ───────────────────────────────────────────────────────────

test('run-pipeline edges: a structural scan that fails is skipped and logged, never recorded', async () => {
  for (const [thrown, why] of [[new Error('git ls-files failed'), 'git ls-files failed'], [null, 'null']]) {
    const host = createFakeHost()
    const dependencies = host.dependencies(SLUG)
    dependencies.sourceTree = { ...dependencies.sourceTree, listFiles: async () => { throw thrown } }

    const outcome = await run(dependencies)

    assert.equal(outcome.status, 'done')
    assert.deepEqual(host.logs.filter((l) => l.startsWith('structural scan')), [`structural scan skipped: ${why}`])
    assert.ok(!host.state(SLUG).phaseArtifacts.RESEARCH.some((p) => p.endsWith('structural-scan.json')))
  }
})

test('run-pipeline edges: DESIGN re-entered on a later run does not scan again', async () => {
  const host = createFakeHost({ verdicts: { DESIGN: ['REJECTED'] } })
  assert.equal((await runOnce(host)).status, 'awaiting-human')
  host.decisions.set('rejected:DESIGN:1', 'rework')

  assert.equal((await runOnce(host)).status, 'done')
  assert.equal(host.scans.length, 1)
  assert.equal(host.logs.filter((l) => l.startsWith('structural scan recorded')).length, 1)
})

// ── Reports bound to reviews ───────────────────────────────────────────────────

test('run-pipeline edges: the forecast reads the newest DISTILL review', async () => {
  const forecast = {
    kind: 'forecast', story: SLUG, title: 'Pay by card', revision: 'a'.repeat(40), language: 'en',
    impact: { expected: 'Card payments accepted; source: test plan' },
    criteria: [{ id: 'AC-1', description: 'Pay by card', test: 'Checkout accepts a valid card' }],
    limitations: [], media: [], maxMedia: 0,
  }
  const host = createFakeHost({ consent: 'chat', verdicts: { DISTILL: ['NEEDS_REWORK', 'NEEDS_REWORK', 'APPROVED'] }, reportData: { forecast } })
  const dependencies = host.dependencies(SLUG)
  const read = []
  const reader = dependencies.repositoryReader.read
  dependencies.repositoryReader = { read: async (path) => { read.push(path); return reader(path) } }

  assert.equal((await run(dependencies)).status, 'done')
  const reviewsRead = read.filter((p) => p.includes('/reviews/') && p.includes('distill-review'))
  assert.deepEqual(reviewsRead, [`${PREFIX}reviews/${TODAY}/distill-review-3.md`])
})

test('run-pipeline edges: a blocked DELIVER binds its outcome report to the DELIVER review', async () => {
  const outcome = {
    kind: 'outcome', story: SLUG, title: 'Pay by card', revision: 'a'.repeat(40), language: 'en',
    impact: { expected: 'Card payments accepted; source: test plan', actual: 'Accepted in AC-1' },
    criteria: [{ id: 'AC-1', description: 'Pay by card', test: 'Checkout accepts a valid card' }],
    limitations: [], media: [], maxMedia: 0,
  }
  const host = createFakeHost({ consent: 'chat', reportData: { outcome }, verdicts: { DELIVER: ['REJECTED'] }, answers: { 'rejected:DELIVER': ['stop'] } })
  const result = await runOnce(host)

  assert.deepEqual(result, { status: 'blocked', phase: 'DELIVER', reason: 'DELIVER rejected; stopped by the human' })
  assert.ok(host.tracking(SLUG, `reporting/${TODAY}/outcome.md`).includes(`reviews/${TODAY}/deliver-review-1.md`))
})

// ── The step guard ────────────────────────────────────────────────────────────

test('run-pipeline edges: a phase that never makes progress stops at the step guard (50 steps)', async () => {
  const escalation = review('NEEDS_REWORK', { escalation: 'environment', findings: 'runner offline' })
  const host = createFakeHost({
    reviews: { DESIGN: Array.from({ length: 40 }, () => escalation) },
    answers: { 'environment:DESIGN': Array.from({ length: 40 }, () => 'fixed') },
  })
  const outcome = await runOnce(host)

  assert.deepEqual(outcome, { status: 'blocked', phase: 'DESIGN', reason: 'step guard reached: the phase made no progress' })
  // step 0 the architect, then reviewer / environment in turn: 25 reviews, 24 questions
  assert.equal(host.dispatches.filter((d) => d.agent === P.DESIGN.reviewer).length, 25)
  assert.equal(host.questions.length, 24)
  assert.equal(host.questions.at(-1).key, 'environment:DESIGN:review:r24:t0:n24')
})

// ── ADR ratification ──────────────────────────────────────────────────────────

test('run-pipeline edges: an unanswered ratification pauses DESIGN with the ratification options; an untitled ADR is named by number', async () => {
  const host = createFakeHost({ adrIndex: adrIndex(['007', '']) })
  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'awaiting-human')
  assert.equal(outcome.phase, 'DESIGN')
  assert.equal(outcome.reason, outcome.checkpoint.question)
  assert.deepEqual(outcome.checkpoint.options, ['accept all', 'reject all', 'pause'])
  assert.deepEqual(host.state(SLUG).adrRatification, {
    checkpointStatus: 'awaiting_human',
    pending: [{ adr: '007', title: 'ADR-007', recommended: 'accept', status: 'Proposed' }],
    ratified: [],
  })
})

test('run-pipeline edges: "pause" keeps the ratification open, at DESIGN, with no ratify dispatch', async () => {
  const host = createFakeHost({ adrIndex: adrIndex(['007', 'Conformist']), answers: { 'adr-ratification': ['pause'] } })
  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'awaiting-human')
  assert.equal(outcome.phase, 'DESIGN')
  assert.equal(outcome.checkpoint.key, 'adr-ratification:007')
  assert.ok(!host.dispatches.some((d) => d.label.startsWith('DESIGN:ratify')))
  assert.equal(host.decisions.get('adr-ratification:007'), 'pause')
})

test('run-pipeline edges: "reject all" tells the architect to reject, and records the human\'s Rejected verdict', async () => {
  const host = createFakeHost({ adrIndex: adrIndex(['007', 'Conformist']), decisions: { 'adr-ratification:007': 'reject all' } })
  assert.equal((await runOnce(host)).status, 'done')

  const ratify = host.dispatches.filter((d) => d.label.startsWith('DESIGN:ratify'))
  assert.deepEqual(ratify.map((d) => d.label), ['DESIGN:ratify:1'])
  assert.ok(ratify[0].prompt.endsWith('## Ratify mode — human verdicts\nApply ratify-mode to these verdicts, then commit:\n- ADR-007: reject'))
  assert.deepEqual(host.state(SLUG).adrRatification, { checkpointStatus: 'resolved', pending: [], ratified: [{ adr: '007', verdict: 'Rejected', by: 'human' }] })
})

test('run-pipeline edges: per-ADR verdicts and amendments are listed one per line for the architect', async () => {
  const host = createFakeHost({
    adrIndex: adrIndex(['007', 'Conformist'], ['008', 'Outbox']),
    decisions: { 'adr-ratification:007,008': '007 accept; 008 amend "narrow the scope"' },
  })
  assert.equal((await runOnce(host)).status, 'done')

  const [ratify] = host.dispatches.filter((d) => d.label.startsWith('DESIGN:ratify'))
  assert.ok(ratify.prompt.endsWith('Apply ratify-mode to these verdicts, then commit:\n- ADR-007: accept\n- ADR-008: amend "narrow the scope"'), ratify.prompt)
  assert.deepEqual(host.state(SLUG).adrRatification, { checkpointStatus: 'resolved', pending: [], ratified: [{ adr: '007', verdict: 'Accepted', by: 'human' }] })
})

test('run-pipeline edges: an architect that never updates the index stops ratification after three rounds', async () => {
  const host = createFakeHost({ adrIndex: adrIndex(['007', 'Conformist']), decisions: { 'adr-ratification:007': 'accept all' } })
  const dependencies = host.dependencies(SLUG)
  const runner = dependencies.agentRunner.run
  const ratifyLabels = []
  dependencies.agentRunner = {
    run: async (dispatch) => {
      if (dispatch.label.startsWith('DESIGN:ratify')) { ratifyLabels.push(dispatch.label); return { ok: true, text: 'nothing changed' } }
      return runner(dispatch)
    },
  }

  const outcome = await run(dependencies)

  assert.deepEqual(outcome, { status: 'blocked', phase: 'DESIGN', reason: 'ADR ratification did not converge after 3 rounds' })
  assert.deepEqual(ratifyLabels, ['DESIGN:ratify:1', 'DESIGN:ratify:2', 'DESIGN:ratify:3'])
  assert.deepEqual(host.state(SLUG).adrRatification, {
    checkpointStatus: 'awaiting_human',
    pending: [{ adr: '007', title: 'Conformist', recommended: 'accept', status: 'Proposed' }],
    ratified: [],
  })
  assert.equal(host.state(SLUG).currentPhase, 'DESIGN')
})

test('run-pipeline edges: a ratification already resolved is not asked again, whatever the index says', async () => {
  const host = await seeded({ adrIndex: adrIndex(['007', 'Conformist']) })
  host.state(SLUG).adrRatification = { checkpointStatus: 'resolved', pending: [], ratified: [] }

  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'done')
  assert.ok(!host.questions.some((q) => q.key.startsWith('adr-ratification')))
  assert.ok(!host.dispatches.some((d) => d.label.startsWith('DESIGN:ratify')))
})

test('run-pipeline edges: ADRs ratified before are kept beside the ones ratified now', async () => {
  const host = await seeded({ adrIndex: adrIndex(['007', 'Conformist']), decisions: { 'adr-ratification:007': 'accept all' } })
  const earlier = { adr: '001', verdict: 'Accepted', by: 'human' }
  host.state(SLUG).adrRatification = { checkpointStatus: 'none', pending: [], ratified: [earlier] }

  assert.equal((await runOnce(host)).status, 'done')
  assert.deepEqual(host.state(SLUG).adrRatification, {
    checkpointStatus: 'resolved',
    pending: [],
    ratified: [earlier, { adr: '007', verdict: 'Accepted', by: 'human' }],
  })
})

test('run-pipeline edges: ADR ratification belongs to DESIGN — DISTILL closes without asking, even with ADRs proposed since', async () => {
  const host = createFakeHost()
  assert.deepEqual(await runOnce(host, { maxPhases: 2 }), { status: 'blocked', phase: null, reason: 'phase guard reached' })
  assert.equal(host.state(SLUG).currentPhase, 'DISTILL')
  host.state(SLUG).adrRatification = { checkpointStatus: 'none', pending: [], ratified: [] }
  host.repository.set('docs/adr/decisions-index.md', adrIndex(['009', 'Late decision']))

  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'done')
  assert.deepEqual(host.questions, [])
  assert.equal(host.state(SLUG).adrRatification.checkpointStatus, 'none')
})
