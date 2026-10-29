import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, nominal, pipelineHost, scripted, SLUG } from '../support/pipeline-host.mjs'

const WORKFLOW = `digraph report {
  start         [shape=Mdiamond]
  research      [shape=box, agent="solution-researcher", phase="RESEARCH"]
  design        [shape=box, agent="solution-architect", phase="DESIGN"]
  design_lenses [shape=component]
  design_consistency [shape=note, lens="consistency"]
  design_fitness [shape=note, lens="fitness"]
  design_review [shape=tripleoctagon]
  adr           [shape=hexagon, question="adr-ratification"]
  exit          [shape=Msquare]
  start -> research -> design -> design_lenses
  design_lenses -> design_consistency -> design_review
  design_lenses -> design_fitness -> design_review
  design_review -> design [label="NEEDS_REWORK", max_visits=2]
  design_review -> adr [label="APPROVED"]
  adr -> exit [label="RATIFIED"]
  adr -> design [label="REJECTED", max_visits=2]
}`

/** An agent that takes `ms` of the clock and costs `costUsd`, doing `work` first; its host names the `model` it ran on, if any. */
const taking = (host, ms, costUsd, work = async () => {}, model = undefined) => async (dispatch) => {
  await work(dispatch)
  await host.clock.pass(ms)
  return { ok: true, text: 'done', costUsd, ...(model === undefined ? {} : { model }) }
}

test('after each step the tracking folder holds run-report.md, with the time, cost and retries of each step, and WORKFLOW.md, with the steps done and to come', async () => {
  const seen = []
  const host = scripted({ workflow: WORKFLOW }, (it) => [
    taking(it, 2000, 0.25),
    taking(it, 3000, 0.5, agent()(it), 'sonnet'),
    taking(it, 4000, 1.25, async (dispatch) => {
      seen.push(await it.tracking.read(SLUG, 'WORKFLOW.md'))
      await agent()(it)(dispatch)
    }),
  ])
  host.agentRunner.batchCostUsd = 0.1

  await host.start()

  assert.equal(seen[0], [
    '<!-- markdownlint-disable-file -->',
    `# Workflow — ${SLUG}`,
    '',
    'running',
    '',
    '## RESEARCH',
    '',
    '- [x] research — solution-researcher: done',
    '',
    '## DESIGN',
    '',
    '- [ ] design — solution-architect',
    '- [ ] design_review — consistency, fitness',
    '- [ ] adr — adr-ratification',
    '',
  ].join('\n'))
  assert.equal(await host.tracking.read(SLUG, 'WORKFLOW.md'), [
    '<!-- markdownlint-disable-file -->',
    `# Workflow — ${SLUG}`,
    '',
    'done: DESIGN closed',
    '',
    '## RESEARCH',
    '',
    '- [x] research — solution-researcher: done',
    '',
    '## DESIGN',
    '',
    '- [x] design — solution-architect: done',
    '- [x] design_review — consistency, fitness: approved',
    '- [x] adr — adr-ratification: skipped',
    '',
  ].join('\n'))
  assert.equal(await host.tracking.read(SLUG, 'run-report.md'), [
    '<!-- markdownlint-disable-file -->',
    `# Run report — ${SLUG}`,
    '',
    'done: DESIGN closed',
    '',
    '| Step | Phase | Visits | Attempts | Retries | Time | Cost | Outcome |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
    '| research | RESEARCH | 1 | 2 | 1 | 5 s | ~$0.75 | done |',
    '| design | DESIGN | 1 | 1 | 0 | 4 s | ~$1.25 | done |',
    '| design_review | DESIGN | 1 | 1 | 0 | 0 s | ~$0.10 | approved |',
    '| adr | DESIGN | 1 | 1 | 0 | 0 s | - | skipped |',
    '| Total | | | 5 | 1 | 9 s | ~$2.10 | |',
    '',
    'Costs are approximate (~): each is what the Claude Code session cost while the agent ran, so it includes anything else exchanged in that session meanwhile.',
    '',
    '## Agents',
    '',
    '| Step | Agent | Family | Tier | Host | Model | Effort |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    '| research | solution-researcher | researcher | standard | claude-code | sonnet | - |',
    '| design | solution-architect | planner | frontier | claude-code | model chosen by the host | - |',
    '| design_review | consistency-lens | reviewer | economy | claude-code | model chosen by the host | - |',
    '| design_review | fitness-lens | reviewer | economy | claude-code | model chosen by the host | - |',
    '',
    'Started at 2026-10-11T09:00:00.000Z; 9 s from the first event to the last.',
    '',
  ].join('\n'))
  assert.deepEqual(await host.report(), {
    slug: SLUG,
    status: 'done',
    reason: 'DESIGN closed',
    steps: [
      { step: 'research', phase: 'RESEARCH', visits: 1, attempts: 2, retries: 1, durationMs: 5000, costUsd: 0.75, outcome: 'done' },
      { step: 'design', phase: 'DESIGN', visits: 1, attempts: 1, retries: 0, durationMs: 4000, costUsd: 1.25, outcome: 'done' },
      { step: 'design_review', phase: 'DESIGN', visits: 1, attempts: 1, retries: 0, durationMs: 0, costUsd: 0.1, outcome: 'approved' },
      { step: 'adr', phase: 'DESIGN', visits: 1, attempts: 1, retries: 0, durationMs: 0, costUsd: null, outcome: 'skipped' },
    ],
    totals: { attempts: 5, retries: 1, durationMs: 9000, costUsd: 2.1 },
    answers: [],
    agents: [
      { step: 'research', agent: 'solution-researcher', family: 'researcher', tier: 'standard', host: 'claude-code', models: ['sonnet'], effort: null },
      { step: 'design', agent: 'solution-architect', family: 'planner', tier: 'frontier', host: 'claude-code', models: null, effort: null },
      { step: 'design_review', agent: 'consistency-lens', family: 'reviewer', tier: 'economy', host: 'claude-code', models: null, effort: null },
      { step: 'design_review', agent: 'fitness-lens', family: 'reviewer', tier: 'economy', host: 'claude-code', models: null, effort: null },
    ],
    startedAt: '2026-10-11T09:00:00.000Z',
    elapsedMs: 9000,
  })
})

test('a step sent back counts each visit, a step the run stopped in shows open in WORKFLOW.md, and a run waiting on a human says what it waits for', async () => {
  const host = scripted({ workflow: WORKFLOW, files: { 'docs/adr/adr-001-card-payment.md': '---\nstatus: Proposed\n---\n' } }, (it) => [
    taking(it, 1000, undefined, agent()(it)),
    taking(it, 1000, undefined, agent()(it)),
    taking(it, 1000, undefined, agent()(it)),
  ])
  let reviews = 0
  host.agentRunner.review = (dispatch) => (dispatch.agent === 'fitness-lens' && reviews++ === 0
    ? 'lens: fitness\nverdict: fail\nfindings:\n  - id: F1\n    gate: G1\n    severity: blocker\n    location: "docs/adr/adr-001-card-payment.md:1"\n    description: "speculative"\n'
    : dispatch.agent === 'finding-refuter' ? 'verdict: confirmed\nreason: "the ADR shows it"\n' : `lens: ${dispatch.agent.replace(/-lens$/, '')}\nverdict: pass\nfindings: []\n`)

  const waiting = await host.start()

  assert.equal(waiting.status, 'waiting')
  const workflow = await host.tracking.read(SLUG, 'WORKFLOW.md')
  assert.ok(workflow.includes(`\nwaiting: ${waiting.reason.split(' Answer with')[0]}\n`), workflow)
  assert.ok(workflow.includes('\n- [x] design — solution-architect: done, pass 2\n'), workflow)
  assert.ok(workflow.includes('\n- [x] design_review — consistency, fitness: approved, pass 2\n'), workflow)
  assert.ok(workflow.includes('\n- [>] adr — adr-ratification: in progress\n'), workflow)
  const steps = (await host.report()).steps.map(({ step, visits, attempts, retries, durationMs, costUsd, outcome }) => [step, visits, attempts, retries, durationMs, costUsd, outcome])
  assert.deepEqual(steps, [
    ['research', 1, 1, 0, 1000, null, 'done'],
    ['design', 2, 2, 1, 2000, null, 'done'],
    ['design_review', 2, 2, 1, 0, null, 'approved'],
    ['adr', 1, 1, 0, 0, null, null],
  ])
  assert.ok((await host.tracking.read(SLUG, 'run-report.md')).includes('\n| adr | DESIGN | 1 | 1 | 0 | 0 s | - | in progress |\n'))

  assert.equal((await host.decide({ answer: 'REJECTED', reason: 'name the provider | Acme' })).ok, true)
  host.agentRunner.behaviours.push(() => ({ ok: false, unavailable: true, text: '' }))
  await host.run()
  const report = await host.report()
  const design = report.steps.find(({ step }) => step === 'design')
  assert.deepEqual([design.visits, design.attempts, design.outcome], [3, 3, null])
  assert.deepEqual(report.answers, [{ key: 'adr-1', kind: 'adr-ratification', step: 'adr', answer: 'REJECTED', reason: 'name the provider | Acme', by: 'decide' }])
  const written = await host.tracking.read(SLUG, 'run-report.md')
  assert.ok(written.includes('\n## Human answers\n\n| Question | Step | Answer | By |\n| --- | --- | --- | --- |\n| adr-1 | adr | REJECTED: name the provider \\| Acme | decide |\n\nStarted at '), written)
})

test('times read in seconds, minutes or hours, and WORKFLOW.md names what each kind of step runs', async () => {
  const host = scripted({ workflow: WORKFLOW }, (it) => [taking(it, 60_000, undefined, agent()(it)), taking(it, 3_600_000, undefined, agent()(it))])

  await host.start()

  const report = await host.tracking.read(SLUG, 'run-report.md')
  assert.ok(report.includes('\n| research | RESEARCH | 1 | 1 | 0 | 1 min 00 s | - | done |\n| design | DESIGN | 1 | 1 | 0 | 1 h 00 min | - | done |\n'), report)
  assert.ok(report.includes('\n| Total | | | 4 | 0 | 1 h 01 min | - | |\n\n## Agents\n'), report)

  const full = scripted({}, (it) => nominal(it))
  await full.start()
  const workflow = await full.tracking.read(SLUG, 'WORKFLOW.md')
  assert.ok(workflow.includes('\n- [x] gates — build, format, lint, test, architecture, coverage: pass\n'), workflow)
  assert.ok(workflow.includes('\n## PUBLISH\n\n- [x] pr_writer — pr-writer: done\n- [x] publish — publish pull-request: local\n'), workflow)
})

test('the report of a journal edited by hand, or of a slug with no journal, is empty and says why', async () => {
  const empty = { steps: [], totals: { attempts: 0, retries: 0, durationMs: 0, costUsd: null }, answers: [], agents: [], startedAt: null, elapsedMs: 0 }
  const host = pipelineHost()
  await host.tracking.activate(SLUG)
  assert.deepEqual(await host.report(), { slug: SLUG, status: 'not-initialised', reason: `${SLUG} has no journal (events.jsonl)`, ...empty })

  await host.init()
  host.tracking.rewriteJournal(SLUG, (lines) => lines.map((line) => line.replace('"prev":null', '"prev":"0"')))
  assert.deepEqual(await host.report(), { slug: SLUG, status: 'tampered', reason: 'journal tampered: events.jsonl line 1 does not open the chain; restore the file or start a new slug', ...empty })
})

test('the report of a working copy with no active pipeline is empty and says why', async () => {
  const host = pipelineHost()

  assert.deepEqual(await host.report(), {
    slug: null,
    status: 'idle',
    reason: 'no active pipeline in this working copy (.copilot-tracking/skraft-plans/.active-slug); start one with an explicit slug',
    steps: [],
    totals: { attempts: 0, retries: 0, durationMs: 0, costUsd: null },
    answers: [],
    agents: [],
    startedAt: null,
    elapsedMs: 0,
  })
})
