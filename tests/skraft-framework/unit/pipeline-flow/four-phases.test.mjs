import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, API, CONSENTS, nominal, pipelineHost, REFS_42, RESEARCH_TEMPLATE, scripted, SLUG, TRACKING } from '../support/pipeline-host.mjs'

const RESEARCH = 'research/2026-10-11/checkout-research.md'
const MATRIX = 'details/2026-10-11/consistency-matrix-checkout.md'
const TEST_PLAN = 'details/2026-10-11/test-plan-checkout.md'
const CHANGE_LOG = 'changes/2026-10-11/change-log.md'
/** The story's issue, as the run read it when it started. */
const ISSUE = 'plans/2026-10-11/issue-42.md'
const RESULT_SHAPE = '{"status": "done" | "blocked", "summary": "<what you did, or why you cannot go on>"}'

test('the nominal run goes through RESEARCH, DESIGN, DISTILL and DELIVER, the gates and the delivery review closing it, then PUBLISH writes the pull request', async () => {
  const host = scripted({}, (it) => nominal(it, REFS_42))

  const outcome = await host.start({ story: { issue: 42, title: 'Pay by card' } })

  assert.deepEqual(outcome, { status: 'done', slug: SLUG, phase: 'PUBLISH', code: null, reason: 'PUBLISH closed' })
  assert.deepEqual(host.agentRunner.dispatches.map(({ agent: id, source, label }) => `${id} ${source} ${label}`), [
    `solution-researcher plugin skraft ${SLUG} · research · attempt 1`,
    `solution-architect plugin skraft ${SLUG} · design · attempt 1`,
    `acceptance-designer plugin skraft ${SLUG} · distill · attempt 1`,
    `software-engineer plugin skraft ${SLUG} · deliver · attempt 1`,
    `pr-writer plugin skraft ${SLUG} · pr_writer · attempt 1`,
  ])
  assert.deepEqual(host.types(), [
    'run.started',
    'step.started', 'step.recorded',
    'step.started', 'step.recorded',
    'step.started', 'step.recorded', 'phase.closed', 'issue.comment-skipped',
    'step.started', 'commits.checked', 'step.recorded',
    'step.started', 'review.lens', 'review.lens', 'review.lens', 'step.recorded',
    'step.started', 'step.recorded', 'phase.closed', 'issue.comment-skipped',
    'step.started', 'commits.checked', 'step.recorded',
    'step.started', 'review.lens', 'review.lens', 'review.lens', 'review.lens', 'step.recorded', 'phase.closed', 'issue.comment-skipped',
    'step.started', 'commits.checked', 'step.recorded',
    'step.started', 'gate.ran', 'gate.ran', 'step.recorded',
    'step.started', 'review.lens', 'review.lens', 'review.lens', 'step.recorded',
    'step.started', 'gate.ran', 'step.recorded',
    'step.started', 'step.recorded', 'phase.closed', 'issue.comment-skipped',
    'step.started', 'step.recorded',
    'step.started', 'step.recorded', 'phase.closed', 'issue.comment-skipped',
    'run.finished', 'issue.comment-skipped',
  ])
  const events = host.events()
  assert.deepEqual(events.filter((event) => event.type === 'phase.closed').map((event) => event.phase), ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER', 'PUBLISH'])
  assert.deepEqual([...new Set(events.filter((event) => event.type === 'issue.comment-skipped').map((event) => event.reason))], ['skraft-config.json does not set publish.pullRequest to true'])
  assert.deepEqual(events.filter((event) => event.type === 'step.recorded').map(({ step, outcome: result, code, next }) => [step, result, code, next]), [
    ['publish_consent', 'skipped', null, 'visuals_consent'],
    ['visuals_consent', 'skipped', null, 'research'],
    ['research', 'done', null, 'design'],
    ['design', 'done', null, 'design_review'],
    ['design_review', 'approved', null, 'adr'],
    ['adr', 'skipped', null, 'distill'],
    ['distill', 'done', null, 'distill_review'],
    ['distill_review', 'approved', null, 'deliver'],
    ['deliver', 'done', null, 'gates'],
    ['gates', 'pass', null, 'deliver_review'],
    ['deliver_review', 'approved', null, 'mutation'],
    ['mutation', 'pass', null, 'visuals'],
    ['visuals', 'skipped', null, 'pr_writer'],
    ['pr_writer', 'done', null, 'publish'],
    ['publish', 'local', null, 'exit'],
  ])
  assert.deepEqual(events.at(-2), { ...events.at(-2), type: 'run.finished', status: 'completed', reason: 'PUBLISH closed' })
  assert.deepEqual(host.progress.lines, [
    'phase RESEARCH', `${SLUG}: publish_consent DECLINED (skraft-config.json sets publish.pullRequest to false)`,
    `${SLUG}: visuals_consent DECLINED (no component of skraft-config.json is a front end (stack react, or an e2e command), so no screenshot is taken)`,
    `${SLUG}: solution-researcher, attempt 1 — researcher · standard · sonnet`, `${SLUG}: RESEARCH closed`,
    'phase DESIGN', `${SLUG}: solution-architect, attempt 1 — planner · frontier · opus`,
    `${SLUG}: design_review (consistency, architecture-compliance, fitness) — reviewer · economy · haiku`, `${SLUG}: design_review APPROVED: every lens passed`,
    `${SLUG}: adr RATIFIED (no Proposed ADR to ratify)`, `${SLUG}: DESIGN closed`,
    'phase DISTILL', `${SLUG}: acceptance-designer, attempt 1 — implementer · standard · sonnet`,
    `${SLUG}: distill_review (coverage, business-alignment, testability, boundary-enforcement) — reviewer · economy · haiku`, `${SLUG}: distill_review APPROVED: every lens passed`, `${SLUG}: DISTILL closed`,
    'phase DELIVER', `${SLUG}: software-engineer, attempt 1 — implementer · standard · sonnet`, `${SLUG}: gates (build, format, lint, test, architecture, coverage)`,
    `${SLUG}: deliver_review (test-integrity, architecture-boundaries, cold-reader, mock-fidelity, contract-fidelity) — reviewer · economy · haiku`, `${SLUG}: deliver_review APPROVED: every lens passed`, `${SLUG}: mutation (mutation)`,
    `${SLUG}: visuals: no component of skraft-config.json is a front end (stack react, or an e2e command)`, `${SLUG}: DELIVER closed`,
    'phase PUBLISH', `${SLUG}: pr-writer, attempt 1 — economy · haiku`, `${SLUG}: publish: pull request not opened: skraft-config.json sets publish.pullRequest to false; pull-request.md holds its description, and skraft publish opens it once that is fixed`, `${SLUG}: PUBLISH closed`,

  ])
})

test('each agent is told its story, inputs, outputs, result file and the paths it may change', async () => {
  const host = scripted({}, (it) => nominal(it, REFS_42))

  await host.start({ story: { issue: 42, title: 'Pay by card' } })

  const [research, design, , deliver] = host.agentRunner.dispatches.map((dispatch) => dispatch.prompt)
  assert.equal(research, [
    '## Skraft dispatch: solution-researcher (RESEARCH)',
    '- Story: #42 — Pay by card',
    `- Feature scope: ${SLUG}`,
    '- Attempt: 1 of 3',
    '- Read first:',
    `- ${TRACKING}/${ISSUE}`,
    '- Fill each output in place; keep the path, create no other copy:',
    `- ${TRACKING}/${RESEARCH}`,
    `- Write your result as JSON to ${TRACKING}/results/research-1-1.json: ${RESULT_SHAPE}`,
    '- Change nothing outside these paths of the working copy; the engine refuses the step otherwise:',
    `- .copilot-tracking/skraft-plans/${SLUG}`,
  ].join('\n'))
  assert.equal(design, [
    '## Skraft dispatch: solution-architect (DESIGN)',
    '- Story: #42 — Pay by card',
    `- Feature scope: ${SLUG}`,
    '- Attempt: 1 of 3',
    '- Read first:',
    `- ${TRACKING}/${ISSUE}`,
    `- ${TRACKING}/${RESEARCH}`,
    `- ${TRACKING}/details/2026-10-11/structural-scan.json`,
    '- Fill each output in place; keep the path, create no other copy:',
    `- ${TRACKING}/${MATRIX}`,
    `- Write your result as JSON to ${TRACKING}/results/design-1-1.json: ${RESULT_SHAPE}`,
    '- Change nothing outside these paths of the working copy; the engine refuses the step otherwise:',
    `- .copilot-tracking/skraft-plans/${SLUG}`,
    '- docs/adr',
    '- docs/architecture',
    '- docs/domain/event-model',
    '- End every commit body with `Refs: #42`; never close the issue in a commit: the pull request closes it.',
  ].join('\n'))
  const distillRed = host.events().find((event) => event.type === 'commits.checked' && event.step === 'distill').commits[0].sha.slice(0, 7)
  assert.equal(deliver, [
    '## Skraft dispatch: software-engineer (DELIVER)',
    '- Story: #42 — Pay by card',
    `- Feature scope: ${SLUG}`,
    '- Attempt: 1 of 3',
    '- Skills (read each before you start):',
    '- /plugin/skills/mocking-inprocess-dotnet/SKILL.md',
    '- Read first:',
    `- ${TRACKING}/${ISSUE}`,
    `- ${TRACKING}/${RESEARCH}`,
    `- ${TRACKING}/${MATRIX}`,
    `- ${TRACKING}/${TEST_PLAN}`,
    '- Fill each output in place; keep the path, create no other copy:',
    `- ${TRACKING}/${CHANGE_LOG}`,
    `- Write your result as JSON to ${TRACKING}/results/deliver-1-1.json: ${RESULT_SHAPE}`,
    '- Change nothing outside these paths of the working copy; the engine refuses the step otherwise:',
    `- .copilot-tracking/skraft-plans/${SLUG}`,
    '- src',
    '- tests',
    '- ./* (the files right in the root of api)',
    '- Components:',
    '- api: . (dotnet), mocking: inprocess, contract testing: off, tests: dotnet test',
    '- Commit each TDD cycle: `test(<story>): …` with the failing test, then `feat(<story>): …` or `fix(<story>): …` with the code that makes it pass,',
    '  then `refactor(<story>): …` if needed. Tests that pass from the start (coverage) go with the code they cover, or in a `refactor` commit;',
    '  lint and format fixes in a `style` commit. The engine runs the tests at every test commit and refuses one whose tests pass,',
    '  a feat or fix commit with no test commit since the last feat or fix (on a pass the gates sent back, their failure counts as that test),',
    '  and any commit that is not `type(scope): subject`. A refused commit stays refused until you rewrite it.',
    '  A test commit whose only failing tests are e2e tests holds all of them, or a failing unit test too; otherwise they go in the feat or fix that makes them pass.',
    '- End every commit body with `Refs: #42`; never close the issue in a commit: the pull request closes it.',
    '- The acceptance tests DISTILL committed stay red until your code passes them; they are not the test of your first cycle:',
    `  your first commit is a failing \`test(<story>): …\` of the inner loop, never a \`feat\`. DISTILL's: ${distillRed} "test(checkout): acceptance of the card payment"`,
  ].join('\n'))
  assert.ok(host.agentRunner.dispatches[2].prompt.endsWith([
    `- .copilot-tracking/skraft-plans/${SLUG}`,
    '- docs/features',
    '- src',
    '- tests',
    '- ./* (the files right in the root of api)',
    '- Components:',
    '- api: . (dotnet), mocking: inprocess, contract testing: off, tests: dotnet test',
    '- Commit the failing acceptance tests as `test(<story>): …`, with the skeleton they call: the signatures the contract names, each answering',
    '  the empty value of its type, no behaviour; a test failing on a missing module proves nothing. The engine runs the tests at every test commit and refuses one whose tests pass,',
    '  and any commit that is not `type(scope): subject`. A refused commit stays refused until you rewrite it.',
    '  A test commit whose only failing tests are e2e tests holds all of them, or a failing unit test too; otherwise they go in the feat or fix that makes them pass.',
    '- End every commit body with `Refs: #42`; never close the issue in a commit: the pull request closes it.',
  ].join('\n')), host.agentRunner.dispatches[2].prompt)
})

test('the step journals its outputs, its result file and where each repository stood', async () => {
  const host = scripted({}, (it) => [agent()(it), () => ({ ok: false, unavailable: true, text: '', error: 'no architect here' })])
  host.git.change('src/Draft.cs')

  await host.start()

  const started = host.events().find((event) => event.type === 'step.started' && event.step === 'research')
  assert.deepEqual(
    { step: started.step, phase: started.phase, agent: started.agent, visit: started.visit, attempt: started.attempt, outputs: started.outputs, result: started.result, missing: started.missing, feedback: started.feedback, heads: started.heads },
    { step: 'research', phase: 'RESEARCH', agent: 'solution-researcher', visit: 1, attempt: 1, outputs: [RESEARCH], result: 'results/research-1-1.json', missing: [], feedback: [], heads: [{ repository: '.', sha: 'root-0', dirty: [{ path: 'src/Draft.cs', hash: null }] }] },
  )
})

test('the research document is pre-created from its template, and one already there is kept', async () => {
  const seen = []
  const host = scripted({}, (it) => [async (dispatch) => { seen.push(await it.tracking.read(SLUG, RESEARCH)); return agent()(it)(dispatch) }])
  host.agentRunner.behaviours.push(() => ({ ok: false, unavailable: true, text: '' }))
  await host.start()
  assert.deepEqual(seen, [RESEARCH_TEMPLATE])

  const kept = []
  const again = scripted({}, (it) => [async (dispatch) => { kept.push(await it.tracking.read(SLUG, RESEARCH)); return agent()(it)(dispatch) }])
  again.agentRunner.behaviours.push(() => ({ ok: false, unavailable: true, text: '' }))
  await again.tracking.write(SLUG, RESEARCH, 'Earlier findings.\n')
  await again.start()
  assert.deepEqual(kept, ['Earlier findings.\n'])
})

test('outputs without a template are not pre-created', async () => {
  const seen = []
  const host = scripted({}, (it) => [agent()(it), async () => { seen.push(await it.tracking.list(SLUG, 'details')); return { ok: false, unavailable: true, text: '' } }])

  await host.start()

  // The context map has no template: only the structural scan the engine writes is there.
  assert.deepEqual(seen, [['details/2026-10-11/structural-scan.json']])
})

test('a document left as its template, with a placeholder left, blank or deleted counts as missing', async () => {
  for (const write of [
    async (it) => it.tracking.write(SLUG, RESEARCH, RESEARCH_TEMPLATE),
    async (it) => it.tracking.write(SLUG, RESEARCH, '# Research: {{topic}}\nFindings.\n'),
    async (it) => it.tracking.write(SLUG, RESEARCH, '  \n'),
    async (it) => { it.tracking.files.delete(`${SLUG}/${RESEARCH}`) },
  ]) {
    const host = scripted({}, (it) => [agent({ fill: false, work: () => write(it) })(it), agent({ fill: false, work: () => write(it) })(it)])

    const outcome = await host.start()

    assert.equal(outcome.code, 'missing-outputs')
    assert.equal(outcome.reason, `solution-researcher failed the same way on attempts 1 and 2: missing outputs: ${TRACKING}/${RESEARCH}`)
  }
})

test('a missing document is asked again with its path, and a retry that fills it goes on', async () => {
  const host = scripted({}, (it) => [agent({ fill: false })(it), agent()(it), () => ({ ok: false, unavailable: true, text: '' })])

  await host.start()

  const [first, second] = host.agentRunner.dispatches
  assert.equal(second.label, `skraft ${SLUG} · research · attempt 2`)
  assert.ok(!first.prompt.includes('Missing outputs'))
  assert.equal(second.prompt, [
    '## Skraft dispatch: solution-researcher (RESEARCH)',
    '- Story: none',
    `- Feature scope: ${SLUG}`,
    '- Attempt: 2 of 3',
    '- Fill each output in place; keep the path, create no other copy:',
    `- ${TRACKING}/${RESEARCH}`,
    `- Write your result as JSON to ${TRACKING}/results/research-1-2.json: ${RESULT_SHAPE}`,
    '- Change nothing outside these paths of the working copy; the engine refuses the step otherwise:',
    `- .copilot-tracking/skraft-plans/${SLUG}`,
    '',
    'Missing outputs from attempt 1 of 3:',
    `- ${TRACKING}/${RESEARCH}`,
  ].join('\n'))
  const recorded = host.events().filter((event) => event.type === 'step.recorded' && !CONSENTS.includes(event.step))
  assert.deepEqual(recorded.map(({ outcome, code, missing, next }) => [outcome, code, missing, next]), [['failed', 'missing-outputs', [RESEARCH], null], ['done', null, [], 'design']])
  assert.deepEqual(host.events().filter((event) => event.type === 'step.started' && !CONSENTS.includes(event.step)).map((event) => [event.attempt, event.missing, event.outputs]), [
    [1, [], [RESEARCH]], [2, [RESEARCH], [RESEARCH]], [1, [], [MATRIX]],
  ])
})

test('a retry after midnight keeps the paths of the first attempt', async () => {
  const host = scripted({}, (it) => [() => it.clock.pass(24 * 3600_000), agent()(it), () => ({ ok: false, unavailable: true, text: '' })])

  await host.start()

  assert.deepEqual(host.events().filter((event) => event.type === 'step.started').map((event) => event.outputs), [[], [], [RESEARCH], [RESEARCH], ['details/2026-10-12/consistency-matrix-checkout.md']])
})

test('an agent the host cannot start stops the run without spending the attempt; the next run dispatches it again', async () => {
  const host = scripted({}, (it) => [() => ({ ok: false, unavailable: true, text: '', error: 'agent "solution-researcher" is not installed' })])

  const outcome = await host.start()

  assert.deepEqual(outcome, { status: 'blocked', slug: SLUG, phase: 'RESEARCH', code: 'agent-unavailable', reason: 'agent "solution-researcher" is not installed' })
  assert.deepEqual(host.types(), ['run.started', 'step.started', 'step.recorded', 'step.started', 'step.recorded', 'step.started', 'run.stopped'])
  assert.deepEqual(host.events()[6], { ...host.events()[6], code: 'agent-unavailable', reason: outcome.reason })

  host.agentRunner.behaviours.push(() => ({ ok: false, unavailable: true, text: '' }))
  assert.equal((await host.run()).reason, 'solution-researcher could not be started')
  host.agentRunner.behaviours.push(agent()(host), () => ({ ok: false, unavailable: true, text: '' }))
  await host.run()
  assert.deepEqual(host.agentRunner.dispatches.map((dispatch) => dispatch.label).slice(0, 3), Array(3).fill(`skraft ${SLUG} · research · attempt 1`))
  assert.equal(host.events().filter((event) => event.type === 'step.started' && event.step === 'research').length, 1)
})

test('an agent that stops without finishing stops the run; one that answers nothing but did its work goes on', async () => {
  const host = scripted({}, () => [() => ({ ok: false, text: '', error: 'aborted by the user' })])

  const outcome = await host.start()

  assert.deepEqual(outcome, { status: 'blocked', slug: SLUG, phase: 'RESEARCH', code: 'agent-failed', reason: 'solution-researcher stopped without finishing: aborted by the user' })
  assert.deepEqual(host.types(), ['run.started', 'step.started', 'step.recorded', 'step.started', 'step.recorded', 'step.started', 'run.stopped'])
  host.agentRunner.behaviours.push(() => ({ ok: false, text: '' }))
  assert.equal((await host.run()).reason, 'solution-researcher stopped without finishing: no answer')

  host.agentRunner.behaviours.push(agent({ answer: { ok: false, text: '' } })(host), () => ({ ok: false, unavailable: true, text: '' }))
  assert.equal((await host.run()).code, 'agent-unavailable')
  assert.equal(host.agentRunner.dispatches.at(-1).agent, 'solution-architect')
})

test('a step records what its dispatch cost and how long it took', async () => {
  const host = scripted({}, (it) => [
    async (dispatch) => {
      it.clock.advance(90_000)
      await agent()(it)(dispatch)
      return { ok: true, text: 'done', costUsd: 0.42 }
    },
    () => ({ ok: false, unavailable: true, text: '' }),
  ])

  await host.start()

  const recorded = host.events().find((event) => event.type === 'step.recorded' && event.step === 'research')
  assert.equal(recorded.durationMs, 90_000)
  assert.equal(recorded.cost, 0.42)
  assert.ok(host.agentRunner.dispatches[0].prompt.includes('- Story: none\n'))
})

test('a run resumed once done dispatches nothing and writes nothing', async () => {
  const host = scripted({}, nominal)
  await host.start()
  const lines = await host.tracking.lines(SLUG)

  const again = await host.run()

  assert.deepEqual(again, { status: 'done', slug: SLUG, phase: 'PUBLISH', code: null, reason: 'PUBLISH closed' })
  assert.equal(host.agentRunner.dispatches.length, 5)
  assert.deepEqual(await host.tracking.lines(SLUG), lines)
})

test('a later agent reads the DISCUSS stories already in the tracking folder', async () => {
  const host = scripted({}, (it) => [agent()(it), () => ({ ok: false, unavailable: true, text: '' })])
  await host.tracking.write(SLUG, 'plans/2026-10-01/stories-v1.md', '# Stories\n')
  await host.tracking.write(SLUG, 'plans/2026-10-01/ac-draft-us-1.md', '# AC\n')
  await host.tracking.write(SLUG, 'plans/2026-10-01/notes.md', '# Notes\n')

  await host.start()

  assert.deepEqual(host.events()[0].artifacts, ['plans/2026-10-01/ac-draft-us-1.md', 'plans/2026-10-01/stories-v1.md'])
  assert.ok(host.agentRunner.dispatches[1].prompt.includes([
    '- Read first:',
    `- ${TRACKING}/plans/2026-10-01/ac-draft-us-1.md`,
    `- ${TRACKING}/plans/2026-10-01/stories-v1.md`,
    `- ${TRACKING}/${RESEARCH}`,
  ].join('\n')))
})

test('a run whose journal another writer changed meanwhile stops without breaking the chain', async () => {
  const appended = pipelineHost()
  await appended.init()
  appended.agentRunner.behaviours.push(async (dispatch) => {
    await appended.tracking.append(SLUG, JSON.stringify({ type: 'decision.recorded', prev: 'x' }))
    return agent()(appended)(dispatch)
  })
  const outcome = await appended.run()
  assert.deepEqual(outcome, { status: 'blocked', slug: SLUG, phase: null, code: 'journal-changed', reason: `${SLUG}: another run wrote events.jsonl meanwhile; run again once it stops` })

  const rewritten = pipelineHost()
  await rewritten.init()
  rewritten.agentRunner.behaviours.push(async (dispatch) => {
    rewritten.tracking.rewriteJournal(SLUG, (lines) => [...lines.slice(0, -1), lines.at(-1).replace('"attempt":1', '"attempt":2')])
    return agent()(rewritten)(dispatch)
  })
  assert.equal((await rewritten.run()).code, 'journal-changed')
})

test('a blocked run run again writes nothing more', async () => {
  const host = scripted({}, (it) => [agent({ fill: false })(it), agent({ fill: false })(it)])
  const first = await host.start()
  const lines = await host.tracking.lines(SLUG)

  const again = await host.run()

  assert.deepEqual(again, first)
  assert.deepEqual(await host.tracking.lines(SLUG), lines)
  assert.deepEqual(host.events().at(-1), { ...host.events().at(-1), type: 'run.finished', status: 'blocked', code: 'missing-outputs', reason: first.reason })
})

test('a configuration that became invalid stops the run before anything is dispatched', async () => {
  const host = pipelineHost()
  await host.init()
  await host.deps.workspace.write('skraft-config.json', '{ "components": 3 }')

  const outcome = await host.run()

  assert.deepEqual(outcome, { status: 'blocked', slug: SLUG, phase: null, code: 'config-invalid', reason: 'skraft-config.json is invalid: components must be an array' })
  assert.equal(host.agentRunner.dispatches.length, 0)
})

test('the engineer works on every component, each with its test command when it has one, a path list left out being the whole root', async () => {
  const WEB = { name: 'web', root: '../web', stack: 'react', mocking: { strategy: 'inprocess' }, paths: { src: ['src'], tests: ['src'] }, commands: { lint: 'npx eslint .' } }
  const host = scripted({ components: [API, WEB] }, (it) => [agent()(it), agent()(it), agent()(it), () => ({ ok: false, unavailable: true, text: '' })])

  await host.start()

  const deliver = host.agentRunner.dispatches[3].prompt
  assert.ok(deliver.includes(`- .copilot-tracking/skraft-plans/${SLUG}\n- src\n- tests\n- ../web/src\n- ./* (the files right in the root of api)\n- ../web/* (the files right in the root of web)\n- Components:\n- api: . (dotnet), mocking: inprocess, contract testing: off, tests: dotnet test\n- web: ../web (react), mocking: inprocess, contract testing: off\n`), deliver)
  assert.ok(host.agentRunner.dispatches[2].prompt.includes(`- .copilot-tracking/skraft-plans/${SLUG}\n- docs/features\n- src\n- tests\n- ../web/src\n- ./* (the files right in the root of api)`))

  const partial = scripted({ components: [{ ...API, paths: { src: ['src'] } }, { ...WEB, paths: { tests: ['src'] } }] }, (it) => [agent()(it), agent()(it), agent()(it), () => ({ ok: false, unavailable: true, text: '' })])
  await partial.start()
  const [distill, engineer] = partial.agentRunner.dispatches.slice(2).map((dispatch) => dispatch.prompt)
  assert.ok(distill.includes(`- .copilot-tracking/skraft-plans/${SLUG}\n- docs/features\n- src\n- .\n- ../web\n- ../web/src\n- ./* (the files right in the root of api)`), distill)
  assert.ok(engineer.includes(`- .copilot-tracking/skraft-plans/${SLUG}\n- src\n- .\n- ../web\n- ../web/src\n- ./* (the files right in the root of api)`), engineer)
})

test('the test command the engineer is given has the run\'s base in place of {baseSha}', async () => {
  const host = scripted({ components: [{ ...API, commands: { test: 'dotnet test --filter Since={baseSha}' } }] }, (it) => [agent()(it), agent()(it), agent()(it), () => ({ ok: false, unavailable: true, text: '' })])

  await host.start()

  assert.ok(host.agentRunner.dispatches[3].prompt.includes('- api: . (dotnet), mocking: inprocess, contract testing: off, tests: dotnet test --filter Since=root-0\n'))
})
