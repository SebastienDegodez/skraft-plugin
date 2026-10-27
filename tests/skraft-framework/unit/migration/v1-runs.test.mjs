import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMigrate } from '../../../../plugins/skraft-framework/engine/application/migration/migrate-usecase.mjs'
import { createInit } from '../../../../plugins/skraft-framework/engine/application/pipeline/init-usecase.mjs'
import { createObserve } from '../../../../plugins/skraft-framework/engine/application/pipeline/observe-usecase.mjs'
import { BUILT_IN_WORKFLOW, InMemorySourceControl, inMemoryDeps } from '../support/in-memory-host.mjs'

/** A v1 run in DISTILL, RESEARCH and DESIGN closed, with what V2 does not carry over. */
const V1_IN_DISTILL = Object.freeze({
  projectSlug: 'checkout-flow',
  currentPhase: 'DISTILL',
  phasesCompleted: ['RESEARCH', 'DESIGN'],
  phaseArtifacts: { DESIGN: ['design/2026-09-01/adr-001.md'] },
  verdicts: { DESIGN: 'APPROVED' },
  retryCount: { DESIGN: 1 },
  reworkCount: { DESIGN: 2 },
  phaseHistory: { DISTILL: { status: 'inProgress', startedAt: '2026-09-02T10:00:00.000Z', baseSha: 'old1' } },
  adrRatification: { checkpointStatus: 'resolved', pending: [], ratified: [{ adr: 'ADR-001', verdict: 'Accepted', by: 'dev' }] },
})

const host = ({ config } = {}) => {
  const deps = inMemoryDeps({ config, sourceControl: new InMemorySourceControl({ '.': { top: '.', mergeBases: { main: 'b2' } } }) })
  return { deps, tracking: deps.journal }
}

/** What migrate reports of a working copy with no skraft-config.json. */
const NO_CONFIG = Object.freeze({ status: 'absent', dropped: [], unmapped: [], reason: 'skraft-config.json is absent; nothing to migrate' })

/** The event without what the journal adds to every line: its time, chain, key and signature. */
const bare = ({ at, prev, keyId, sig, ...event }) => event

test('a v1 run in progress becomes a journal that closes its completed phases and restarts its current phase at its first node', async () => {
  const { deps, tracking } = host()
  await tracking.write('checkout-flow', 'state.json', JSON.stringify(V1_IN_DISTILL))

  const outcome = await createMigrate(deps).migrate({ dryRun: false })

  assert.equal(outcome.ok, true, outcome.reason)
  assert.deepEqual(tracking.journal('checkout-flow').map(bare), [
    {
      type: 'run.started', slug: 'checkout-flow', story: null, workflow: 'skraft', artifacts: [], start: 'distill', unlocked: [], migratedFrom: 'v1',
      base: [{ component: null, root: '.', repository: '.', ref: 'main', source: 'default', sha: 'b2' }],
    },
    { type: 'phase.closed', phase: 'RESEARCH' },
    { type: 'phase.closed', phase: 'DESIGN' },
  ])
  assert.equal(await tracking.read('checkout-flow', 'state.json'), JSON.stringify(V1_IN_DISTILL))
  assert.deepEqual(outcome.pipelines, [{ slug: 'checkout-flow', status: 'migrated', code: null, reason: 'checkout-flow: DISTILL restarts at distill, RESEARCH and DESIGN closed; resume it with skraft init checkout-flow' }])
})

test('a migrated run resumes with an explicit init, its completed phases closed and its current phase not started', async () => {
  const { deps, tracking } = host()
  await tracking.write('checkout-flow', 'state.json', JSON.stringify(V1_IN_DISTILL))
  await createMigrate(deps).migrate({ dryRun: false })

  const resumed = await createInit(deps).init({ slug: 'checkout-flow' })
  const view = await createObserve(deps).view()

  assert.deepEqual([resumed.ok, resumed.created, tracking.activeSlug], [true, false, 'checkout-flow'])
  assert.deepEqual(view.phases, [
    { phase: 'RESEARCH', state: 'closed' },
    { phase: 'DESIGN', state: 'closed' },
    { phase: 'DISTILL', state: 'pending' },
    { phase: 'DELIVER', state: 'pending' },
    { phase: 'PUBLISH', state: 'pending' },
  ])
})

test('migrating again changes nothing: a migrated run is skipped, as is a run that already has a V2 journal', async () => {
  const { deps, tracking } = host()
  await tracking.write('checkout-flow', 'state.json', JSON.stringify(V1_IN_DISTILL))
  await tracking.write('refund', 'state.json', JSON.stringify(V1_IN_DISTILL))
  await createInit(deps).init({ slug: 'refund' })
  await createMigrate(deps).migrate({ dryRun: false })
  const before = new Map(tracking.files)

  const again = await createMigrate(deps).migrate({ dryRun: false })

  assert.deepEqual(tracking.files, before)
  assert.deepEqual(again, {
    ok: true, code: null, dryRun: false, config: NO_CONFIG, reason: 'skraft migrate: 0 migrated, 2 skipped, 0 refused',
    pipelines: [
      { slug: 'checkout-flow', status: 'skipped', code: 'already-migrated', reason: 'checkout-flow: already migrated from v1' },
      { slug: 'refund', status: 'skipped', code: 'has-journal', reason: 'refund: already has a journal (events.jsonl); state.json is left as it is' },
    ],
  })
})

test('a v1 run that is DONE is skipped and reported, and gets no journal', async () => {
  const { deps, tracking } = host()
  await tracking.write('shipped', 'state.json', JSON.stringify({ currentPhase: 'DONE', phasesCompleted: ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER'] }))
  await tracking.write('checkout-flow', 'state.json', JSON.stringify(V1_IN_DISTILL))

  const outcome = await createMigrate(deps).migrate({ dryRun: false })

  assert.deepEqual(await tracking.lines('shipped'), [])
  assert.equal(outcome.reason, 'skraft migrate: 1 migrated, 1 skipped, 0 refused')
  assert.deepEqual(outcome.pipelines.map(({ slug, status, code, reason }) => [slug, status, code, reason]), [
    ['checkout-flow', 'migrated', null, 'checkout-flow: DISTILL restarts at distill, RESEARCH and DESIGN closed; resume it with skraft init checkout-flow'],
    ['shipped', 'skipped', 'done', 'shipped: the v1 run is DONE; nothing to migrate'],
  ])
})

test('a dry run writes nothing and shows the events each journal would start with', async () => {
  const { deps, tracking } = host()
  await tracking.write('checkout-flow', 'state.json', JSON.stringify({ currentPhase: 'DELIVER', phasesCompleted: ['RESEARCH', 'DESIGN', 'DISTILL'] }))
  await tracking.write('checkout-flow', 'plans/2026-09-01/stories-m1.md', '# Stories')
  const before = new Map(tracking.files)

  const outcome = await createMigrate(deps).migrate({ dryRun: true })

  assert.deepEqual(tracking.files, before)
  assert.deepEqual(outcome, {
    ok: true, code: null, dryRun: true, config: NO_CONFIG, reason: 'skraft migrate: 1 to migrate (dry run: nothing written), 0 skipped, 0 refused',
    pipelines: [{
      slug: 'checkout-flow', status: 'would-migrate', code: null,
      reason: 'checkout-flow: DELIVER restarts at deliver, RESEARCH, DESIGN and DISTILL closed; resume it with skraft init checkout-flow',
      events: [
        {
          type: 'run.started', slug: 'checkout-flow', story: null, workflow: 'skraft', artifacts: ['plans/2026-09-01/stories-m1.md'], start: 'deliver', unlocked: [], migratedFrom: 'v1',
          base: [{ component: null, root: '.', repository: '.', ref: 'main', source: 'default', sha: 'b2' }],
        },
        { type: 'phase.closed', phase: 'RESEARCH' },
        { type: 'phase.closed', phase: 'DESIGN' },
        { type: 'phase.closed', phase: 'DISTILL' },
      ],
    }],
  })
})

test('a v1 run in its first phase restarts at the first node of the workflow, with no phase closed', async () => {
  const { deps, tracking } = host()
  await tracking.write('checkout-flow', 'state.json', JSON.stringify({ projectSlug: null, currentPhase: 'RESEARCH' }))

  const outcome = await createMigrate(deps).migrate({ dryRun: false })

  assert.deepEqual(tracking.journal('checkout-flow').map(({ type, start }) => [type, start]), [['run.started', 'publish_consent']])
  assert.equal(outcome.pipelines[0].reason, 'checkout-flow: RESEARCH restarts at publish_consent; resume it with skraft init checkout-flow')
})

test('the current phase restarts in the workflow the repository ejected', async () => {
  const { deps, tracking } = host()
  const sketchFirst = BUILT_IN_WORKFLOW
    .replace('design   [shape=box', 'sketch [shape=box, agent="solution-architect", phase="DESIGN"]\n  design   [shape=box')
    .replace('research -> design ->', 'research -> sketch -> design ->')
  await deps.workspace.write('.skraft/pipeline.skraft.dot', sketchFirst)
  await tracking.write('checkout-flow', 'state.json', JSON.stringify({ currentPhase: 'DESIGN', phasesCompleted: ['RESEARCH'] }))

  const outcome = await createMigrate(deps).migrate({ dryRun: false })

  assert.equal(outcome.ok, true, outcome.reason)
  assert.deepEqual(tracking.journal('checkout-flow').map(({ type, workflow, start, phase }) => [type, workflow ?? phase, start]), [
    ['run.started', '.skraft/pipeline.skraft.dot', 'sketch'],
    ['phase.closed', 'RESEARCH', undefined],
  ])
})

const NOTHING = 'nothing was migrated'

test('a state.json that is not of the v1 schema is refused with a fixed reason, and the other runs are migrated', async () => {
  const { deps, tracking } = host()
  await tracking.write('a-undeclared', 'state.json', JSON.stringify({ ...V1_IN_DISTILL, version: 2 }))
  await tracking.write('b-no-phase', 'state.json', JSON.stringify({ phasesCompleted: ['RESEARCH'] }))
  await tracking.write('c-not-json', 'state.json', '{ "currentPhase": ')
  await tracking.write('d-array', 'state.json', '["DESIGN"]')
  await tracking.write('e-completed', 'state.json', JSON.stringify({ currentPhase: 'DESIGN', phasesCompleted: 'RESEARCH' }))
  await tracking.write('f-object', 'state.json', JSON.stringify({ currentPhase: 'DESIGN', verdicts: ['APPROVED'] }))
  await tracking.write('g-slug', 'state.json', JSON.stringify({ currentPhase: 'DESIGN', projectSlug: '' }))
  await tracking.write('h-empty-phase', 'state.json', JSON.stringify({ currentPhase: '' }))
  await tracking.write('i-null-field', 'state.json', JSON.stringify({ currentPhase: 'DESIGN', phaseHistory: null }))
  await tracking.write('z-good', 'state.json', JSON.stringify(V1_IN_DISTILL))

  const outcome = await createMigrate(deps).migrate({ dryRun: false })

  const undeclared = `state.json holds a field the v1 state schema does not declare; ${NOTHING}`
  const noPhase = `state.json names no currentPhase; ${NOTHING}`
  const wrongType = `state.json holds a field whose type the v1 state schema does not allow; ${NOTHING}`
  const notAnObject = `state.json holds no JSON object; ${NOTHING}`
  assert.deepEqual(outcome.pipelines.map(({ slug, status, code, reason }) => [slug, status, code, reason]), [
    ['a-undeclared', 'refused', 'state-invalid', `a-undeclared: ${undeclared}`],
    ['b-no-phase', 'refused', 'state-invalid', `b-no-phase: ${noPhase}`],
    ['c-not-json', 'refused', 'state-invalid', `c-not-json: ${notAnObject}`],
    ['d-array', 'refused', 'state-invalid', `d-array: ${notAnObject}`],
    ['e-completed', 'refused', 'state-invalid', `e-completed: ${wrongType}`],
    ['f-object', 'refused', 'state-invalid', `f-object: ${wrongType}`],
    ['g-slug', 'refused', 'state-invalid', `g-slug: ${wrongType}`],
    ['h-empty-phase', 'refused', 'state-invalid', `h-empty-phase: ${noPhase}`],
    ['i-null-field', 'refused', 'state-invalid', `i-null-field: ${wrongType}`],
    ['z-good', 'migrated', null, 'z-good: DISTILL restarts at distill, RESEARCH and DESIGN closed; resume it with skraft init z-good'],
  ])
  assert.deepEqual([outcome.ok, outcome.code, outcome.reason], [false, 'some-refused', 'skraft migrate: 1 migrated, 0 skipped, 9 refused'])
  for (const slug of ['a-undeclared', 'b-no-phase', 'c-not-json', 'e-completed']) assert.deepEqual(await tracking.lines(slug), [])
})

test('a v1 run whose phases the workflow in force no longer holds is refused', async () => {
  const { deps, tracking } = host()
  await tracking.write('current', 'state.json', JSON.stringify({ currentPhase: 'DISCUSS' }))
  await tracking.write('completed', 'state.json', JSON.stringify({ currentPhase: 'DESIGN', phasesCompleted: ['RESEARCH', 'DISCUSS'] }))

  const outcome = await createMigrate(deps).migrate({ dryRun: false })

  assert.deepEqual(outcome.pipelines.map(({ slug, code, reason }) => [slug, code, reason]), [
    ['completed', 'phase-unknown', 'completed: state.json names a phase the workflow skraft does not hold; nothing was migrated'],
    ['current', 'phase-unknown', 'current: state.json names a phase the workflow skraft does not hold; nothing was migrated'],
  ])
  assert.deepEqual([await tracking.lines('current'), await tracking.lines('completed')], [[], []])
})

test('without a folder for the journal key, nothing is migrated', async () => {
  const { deps, tracking } = host()
  deps.journalKeys.available = async () => false
  await tracking.write('checkout-flow', 'state.json', JSON.stringify(V1_IN_DISTILL))

  const outcome = await createMigrate(deps).migrate({ dryRun: false })

  assert.deepEqual(outcome, {
    ok: false, code: 'journal-key-unavailable', dryRun: false, config: NO_CONFIG, pipelines: [],
    reason: 'the environment names no home folder (HOME or USERPROFILE), where the key that signs the journal is kept; set it and start again',
  })
  assert.deepEqual(await tracking.lines('checkout-flow'), [])
})

test('with no v1 run left in progress, nothing is resolved and nothing is refused', async () => {
  const { deps, tracking } = host({ config: '{ not json' })
  deps.journalKeys.available = async () => false
  await tracking.write('shipped', 'state.json', JSON.stringify({ currentPhase: 'DONE' }))
  await tracking.write('v2-run', 'events.jsonl', '')

  const outcome = await createMigrate(deps).migrate({})

  assert.deepEqual(outcome, {
    ok: true, code: null, dryRun: false, config: { status: 'unchanged', dropped: [], unmapped: [], reason: 'skraft-config.json holds no v1 key; left as it is' }, reason: 'skraft migrate: 0 migrated, 1 skipped, 0 refused',
    pipelines: [{ slug: 'shipped', status: 'skipped', code: 'done', reason: 'shipped: the v1 run is DONE; nothing to migrate' }],
  })
})

test('a configuration, a workflow or a base Init would refuse refuses the migration, which writes nothing', async () => {
  const refusedBy = async (setUp) => {
    const { deps, tracking } = host(setUp.config === undefined ? {} : { config: setUp.config })
    await setUp.change?.(deps)
    await tracking.write('checkout-flow', 'state.json', JSON.stringify(V1_IN_DISTILL))
    const outcome = await createMigrate(deps).migrate({ dryRun: false })
    assert.deepEqual(await tracking.lines('checkout-flow'), [])
    return [outcome.ok, outcome.code]
  }

  assert.deepEqual(await refusedBy({ config: '{ not json' }), [false, 'config-invalid'])
  assert.deepEqual(await refusedBy({ change: (deps) => deps.workspace.write('.skraft/pipeline.skraft.dot', 'digraph {') }), [false, 'workflow-invalid'])
  assert.deepEqual(await refusedBy({ change: (deps) => { deps.sourceControl.folders['.'].mergeBases = {} } }), [false, 'base-unresolved'])
})
