import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUILT_IN_WORKFLOW, InMemoryCodeHost, ScriptedMachine } from '../support/in-memory-host.mjs'
import { agent, finding, lenses, nominal, REFS_42, says, scripted, SLUG, TRACKING } from '../support/pipeline-host.mjs'
import { ADR_1, adrText, afterDesign, architect, eventsOf } from '../support/decisions.mjs'
import { strykerReport } from '../support/mutation-reports.mjs'
import { edit } from '../workflow/support.mjs'

const CONSENTED = { publish: { pullRequest: true, questionVersions: { pullRequest: 2 } } }
const STORY = { story: { issue: 42, title: 'Pay by card' } }
const PHASES = ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER', 'PUBLISH']
const MARKER = `<!-- skraft:issue-progress slug=${SLUG} -->`
const COMMENT = 'https://github.example.com/acme/shop/issues/42#issuecomment-901'
const STRYKER = '. $ dotnet stryker'
const MUTATION_REPORT = 'StrykerOutput/reports/mutation-report.json'
const CHECKOUT_SURVIVORS = strykerReport({ '/work/src/Checkout.cs': [[12, 'Equality', '!=', 'Survived'], [20, 'Boolean', 'false', 'NoCoverage']] }, { projectRoot: '/work/src' })
/** A software-engineer that commits a test to kill the checkout's mutants. */
const killer = agent({ work: ({ git }) => git.commit(`test(${SLUG}): kill the mutants of Checkout`, ['tests/CheckoutTests.cs'], REFS_42) })
/** A repository review `<id>` the consistency lens alone runs: its fan-out, its lens, its fan-in. @param {string} id */
const reviewNodes = (id) => `  ${id}_lenses [shape=component]\n  ${id}_consistency [shape=note, lens="consistency"]\n  ${id} [shape=tripleoctagon]`
/** Its edges: the lens between fan-out and fan-in, NEEDS_REWORK to `rework`, APPROVED to `approved`. @param {string} id @param {string} rework @param {string} approved */
const reviewEdges = (id, rework, approved) => [
  `  ${id}_lenses -> ${id}_consistency -> ${id}`,
  `  ${id} -> ${rework} [label="NEEDS_REWORK", max_visits=3]`,
  `  ${id} -> ${approved} [label="APPROVED"]`,
].join('\n')

/** What the forge was asked to keep, in order. */
const kept = (host) => host.codeHost.calls.filter((call) => call.startsWith('keep comment'))
/** The journaled transitions: type, kind, phase, url or reason. */
const journaled = (host) => host.events().filter((event) => event.type.startsWith('issue.'))
  .map(({ type, kind, phase, url, reason }) => [type, kind, phase, url ?? reason])

test('a run from an issue keeps one comment on it, posted when the first phase closes and rewritten at each transition, rendered by the engine from the journal', async () => {
  const host = scripted({ config: CONSENTED }, (it) => nominal(it, REFS_42))

  assert.equal((await host.start(STORY)).status, 'done')

  assert.equal(host.codeHost.posted, 1, 'one comment, so one notification')
  assert.deepEqual(kept(host), ['keep comment #42', ...Array(5).fill('keep comment #42 #issuecomment-901')])
  assert.equal(host.codeHost.calls.indexOf('push checkout'), 4, 'the four phases before PUBLISH are kept as they close, before the branch is pushed')
  const [comment] = host.codeHost.comments
  assert.equal(comment.bodies[0], [
    MARKER,
    '### skraft · checkout — RESEARCH closed',
    '',
    '- [x] RESEARCH',
    '- [ ] DESIGN',
    '- [ ] DISTILL',
    '- [ ] DELIVER',
    '- [ ] PUBLISH',
    '',
    'Next: DESIGN.',
    '',
    'Reviews: none yet.',
    '',
    'Quality gates: none ran.',
    '',
    'Pull request: none opened or updated by this run.',
    '',
    'Total: 3 attempts, 0 retries, 0 s, cost -.',
    '',
    `Run report and evidence: \`.copilot-tracking/skraft-plans/${SLUG}/\``,
    '',
    '<details><summary>Steps</summary>',
    '',
    '| Phase | Step | Visits | Attempts | Retries | Time | Cost | Outcome |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
    '| RESEARCH | publish_consent | 1 | 1 | 0 | 0 s | - | skipped |',
    '| RESEARCH | visuals_consent | 1 | 1 | 0 | 0 s | - | skipped |',
    '| RESEARCH | research | 1 | 1 | 0 | 0 s | - | done |',
    '',
    '</details>',
    '',
  ].join('\n'))
  assert.equal(comment.body, [
    MARKER,
    '### skraft · checkout — run done',
    '',
    'done',
    '',
    ...PHASES.map((phase) => `- [x] ${phase}`),
    '',
    'Reviews: design_review approved (1 pass), distill_review approved (1 pass), deliver_review approved (1 pass).',
    '',
    'Quality gates:',
    '- api/build pass · `gates/api/build-1.log`',
    '- api/test pass · `gates/api/test-1.log`',
    '- api/mutation pass · `gates/api/mutation-1.log`',
    '',
    'Pull request: #42 https://github.example.com/acme/shop/pull/42',
    '',
    'Total: 15 attempts, 0 retries, 0 s, cost -.',
    '',
    `Run report and evidence: \`.copilot-tracking/skraft-plans/${SLUG}/\``,
    '',
    '',
  ].join('\n') + comment.body.slice(comment.body.indexOf('<details>')))
  assert.ok(comment.bodies[4].includes('\n- [x] PUBLISH\n\nNext: the end of the workflow.\n'), comment.bodies[4])
  assert.equal(await host.tracking.read(SLUG, 'issue-progress.md'), comment.body)
  assert.deepEqual(journaled(host), [...PHASES.map((phase) => ['issue.commented', 'phase', phase, COMMENT]), ['issue.commented', 'summary', null, COMMENT]])
  assert.deepEqual(host.types().slice(-2), ['run.finished', 'issue.commented'])
  assert.ok(host.progress.lines.includes(`${SLUG}: issue #42 updated (RESEARCH closed): ${COMMENT}`), host.progress.lines.join('\n'))
})

test('without an issue the run keeps nothing; without consent, or with an acceptance of an earlier question, it journals each transition skipped and asks the forge nothing', async () => {
  const noIssue = scripted({ config: CONSENTED }, (it) => nominal(it))
  assert.equal((await noIssue.start({ story: { title: 'Pay by card' } })).status, 'done')
  const declined = scripted({ config: { publish: { pullRequest: false } } }, (it) => nominal(it, REFS_42))
  assert.equal((await declined.start(STORY)).status, 'done')

  assert.deepEqual(journaled(noIssue), [])
  assert.equal(await noIssue.tracking.read(SLUG, 'issue-progress.md'), null)
  const unconsented = 'skraft-config.json does not set publish.pullRequest to true'
  assert.deepEqual(journaled(declined), [...PHASES, null].map((phase) => ['issue.comment-skipped', phase === null ? 'summary' : 'phase', phase, unconsented]))
  assert.equal(await declined.tracking.read(SLUG, 'issue-progress.md'), null)
  assert.equal(declined.progress.lines.some((line) => line.includes('issue #42')), false, declined.progress.lines.join('\n'))
  for (const host of [noIssue, declined]) assert.deepEqual(kept(host), [])

  await declined.workspace.write('skraft-config.json', JSON.stringify({ ...declined.workspace.config(), ...CONSENTED }))
  await declined.run()
  assert.deepEqual(kept(declined), [], 'a consent given later tells none of the transitions already journaled')

  const outdated = scripted({ config: { publish: { pullRequest: true } } }, (it) => nominal(it, REFS_42).slice(1))
  await outdated.tracking.write(SLUG, 'plans/2026-10-01/stories-v1.md', '# Stories\n')
  await outdated.tracking.write(SLUG, 'plans/2026-10-01/ac-draft-us-1.md', '# AC\n')
  assert.equal((await outdated.init({ fromArtifacts: true, ...STORY })).ok, true)
  assert.equal((await outdated.run()).status, 'done')
  assert.deepEqual(kept(outdated), [])
  assert.equal(outdated.codeHost.calls.includes('push checkout'), true, 'the acceptance of the earlier question still covers the pull request')
  assert.deepEqual([...new Set(journaled(outdated).map(([, , , reason]) => reason))], ['publish.pullRequest in skraft-config.json answers an earlier publish-consent question, which did not cover the issue'])
})

test('a run started from artifacts tells the phases it ran, not those it found closed', async () => {
  const host = scripted({ config: CONSENTED }, (it) => nominal(it, REFS_42).slice(1))
  await host.tracking.write(SLUG, 'plans/2026-10-01/stories-v1.md', '# Stories\n')
  await host.tracking.write(SLUG, 'plans/2026-10-01/ac-draft-us-1.md', '# AC\n')

  assert.equal((await host.init({ fromArtifacts: true, ...STORY })).ok, true)
  assert.equal((await host.run()).status, 'done')

  assert.deepEqual(journaled(host).map(([, kind, phase]) => [kind, phase]), [...PHASES.slice(1).map((phase) => ['phase', phase]), ['summary', null]])
  assert.ok(host.codeHost.comments[0].body.includes('\n- [x] RESEARCH\n- [x] DESIGN\n'), host.codeHost.comments[0].body)
})

test('a transition the forge cannot take is journaled skipped with its reason and said; the next one keeps the whole run; a run already done tries nothing again', async () => {
  const unreachable = scripted({ config: CONSENTED, codeHost: new InMemoryCodeHost({ unavailable: 'gh, the GitHub CLI, is not installed' }) }, (it) => nominal(it, REFS_42))
  const refusing = scripted({ config: CONSENTED, codeHost: new InMemoryCodeHost({ fails: { comment: 'gh could not comment issue #42 on github.com/acme/shop' } }) }, (it) => nominal(it, REFS_42))

  assert.equal((await unreachable.start(STORY)).status, 'done')
  assert.equal((await refusing.start(STORY)).status, 'done')

  assert.deepEqual(kept(unreachable), [])
  assert.deepEqual(journaled(unreachable), [...PHASES, null].map((phase) => ['issue.comment-skipped', phase === null ? 'summary' : 'phase', phase, 'gh, the GitHub CLI, is not installed']))
  assert.ok((await unreachable.tracking.read(SLUG, 'issue-progress.md')).includes('run done'), 'the comment stays in the tracking folder')
  assert.ok(unreachable.progress.lines.includes(`${SLUG}: issue #42 not updated (RESEARCH closed): gh, the GitHub CLI, is not installed`), unreachable.progress.lines.join('\n'))
  assert.ok(unreachable.progress.lines.includes(`${SLUG}: issue #42 not updated (summary): gh, the GitHub CLI, is not installed`), unreachable.progress.lines.join('\n'))
  assert.equal(kept(refusing).length, 6)
  assert.deepEqual(journaled(refusing).at(-1), ['issue.comment-skipped', 'summary', null, 'gh could not comment issue #42 on github.com/acme/shop'])

  await refusing.run()
  assert.equal(kept(refusing).length, 6, 'a run of a pipeline already done tries no comment again')
})

test('the comment is found again by its marker when the journal lost its URL, and posted again when a human deleted it', async () => {
  const lost = scripted({ config: CONSENTED }, (it) => nominal(it, REFS_42))
  lost.codeHost.comments.push({ number: 42, bodyFile: '', body: `${MARKER}\nan earlier run's progress\n`, bodies: [], edits: 0, url: 'https://github.example.com/acme/shop/issues/42#issuecomment-700' })

  assert.equal((await lost.start(STORY)).status, 'done')
  assert.equal(lost.codeHost.posted, 0, 'the comment posted before the journal could keep its URL is rewritten, never posted twice')
  assert.deepEqual([...new Set(eventsOf(lost, 'issue.commented').map(({ url }) => url))], ['https://github.example.com/acme/shop/issues/42#issuecomment-700'])

  const deleted = scripted({ config: CONSENTED }, (it) => [agent()(it), architect({ [ADR_1]: adrText() }, REFS_42)(it), ...nominal(it, REFS_42).slice(2)])
  assert.equal((await deleted.start(STORY)).status, 'waiting')
  deleted.codeHost.comments.length = 0
  await deleted.decide({ key: 'adr-1', answer: 'RATIFIED' })
  assert.equal((await deleted.run()).status, 'done')
  assert.equal(deleted.codeHost.posted, 2)
  assert.deepEqual([...new Set(eventsOf(deleted, 'issue.commented').map(({ url }) => url))], [COMMENT, 'https://github.example.com/acme/shop/issues/42#issuecomment-902'])
})

test('a run that waits on a human keeps the phases it closed; the run that goes on after the answer keeps only the next ones', async () => {
  const host = scripted({ config: CONSENTED, files: {} }, (it) => [agent()(it), architect({ [ADR_1]: adrText() }, REFS_42)(it), ...afterDesign(it, REFS_42)])

  assert.equal((await host.start(STORY)).status, 'waiting')
  assert.deepEqual(journaled(host).map(([, kind, phase]) => [kind, phase]), [['phase', 'RESEARCH']])
  assert.ok(host.codeHost.comments[0].body.includes('\n- [ ] DESIGN\n'), host.codeHost.comments[0].body)
  assert.equal((await host.run()).status, 'waiting')
  assert.equal(kept(host).length, 1)

  await host.decide({ key: 'adr-1', answer: 'RATIFIED' })
  assert.equal((await host.run()).status, 'done')

  assert.deepEqual(journaled(host).map(([, kind, phase]) => [kind, phase]), [...PHASES.map((phase) => ['phase', phase]), ['summary', null]])
  assert.equal(host.codeHost.posted, 1)
})

test('a review that sends the work back is a transition: the comment says so, and the review\'s passes', async () => {
  const blocker = says('consistency', 'fail', [finding('F1', 'blocker', 'the ADR contradicts the context map')])
  const host = scripted({ config: CONSENTED }, (it) => [...nominal(it, REFS_42).slice(0, 2), agent()(it), ...nominal(it, REFS_42).slice(2)])
  host.agentRunner.review = lenses({ consistency: [blocker] })

  assert.equal((await host.start(STORY)).status, 'done')

  const rework = eventsOf(host, 'issue.commented').find((event) => event.kind === 'rework')
  assert.deepEqual({ phase: rework.phase, step: rework.step }, { phase: 'DESIGN', step: 'design_review' })
  const told = host.codeHost.comments[0].bodies[1]
  assert.ok(told.startsWith(`${MARKER}\n### skraft · checkout — design_review asked for rework\n`), told)
  assert.ok(told.includes('\n- [x] RESEARCH\n- [ ] DESIGN — in progress\n- [ ] DISTILL\n'), told)
  assert.ok(told.includes('\nNext: DESIGN.\n\nReviews: design_review needs-rework (1 pass).\n'), told)
  assert.ok(host.codeHost.comments[0].body.includes('Reviews: design_review approved (2 passes), '), host.codeHost.comments[0].body)
  assert.ok(host.progress.lines.includes(`${SLUG}: issue #42 updated (design_review asked for rework): ${COMMENT}`), host.progress.lines.join('\n'))
})

test('a pull request the run updated after opening it is said updated', async () => {
  const dot = edit(BUILT_IN_WORKFLOW,
    ['  exit     [shape=Msquare]', `  exit     [shape=Msquare]\n${reviewNodes('publish_review')}`],
    ['  visuals -> pr_writer -> publish -> exit', `  visuals -> pr_writer -> publish -> publish_review_lenses\n${reviewEdges('publish_review', 'pr_writer', 'exit')}`])
  const host = scripted({ config: { ...CONSENTED, workflow: 'skraft-workflow.dot' }, files: { 'skraft-workflow.dot': dot } }, (it) => nominal(it, REFS_42))
  host.agentRunner.review = lenses({ consistency: [says('consistency', 'pass'), says('consistency', 'fail', [finding('F1', 'blocker', 'the description names no test')])] })

  assert.equal((await host.start(STORY)).status, 'done')

  const { bodies } = host.codeHost.comments[0]
  const told = bodies.find((body) => body.includes('publish_review asked for rework'))
  assert.ok(told.includes('\nPull request: #42 https://github.example.com/acme/shop/pull/42\n'), told)
  assert.ok(bodies.at(-1).includes('\nPull request: #42 https://github.example.com/acme/shop/pull/42 (updated)\n'), bodies.at(-1))
})

test('each gate shows its last result and its log, a mutation gate that handed mutants out how many survive', async () => {
  const host = scripted({ config: CONSENTED, machine: new ScriptedMachine() }, (it) => [...nominal(it, REFS_42), killer(it), killer(it)])
  host.machine.meanwhile[STRYKER] = async () => {
    host.machine.exits[STRYKER] = 1
    await host.workspace.write(MUTATION_REPORT, CHECKOUT_SURVIVORS)
  }

  assert.equal((await host.start(STORY)).code, 'mutation-stalled')

  const { body } = host.codeHost.comments[0]
  assert.ok(body.includes([
    '\nQuality gates:',
    '- api/build pass · `gates/api/build-3.log`',
    '- api/test pass · `gates/api/test-3.log`',
    '- api/mutation fail, 2 surviving mutants · `gates/api/mutation-3.log`\n',
  ].join('\n')), body)
})

test('a blocked run is summarised where it stopped by its status and code: neither what an agent wrote nor a path of the machine reaches the issue', async () => {
  const host = scripted({ config: CONSENTED }, (it) => [agent({ result: { status: 'blocked', summary: 'No provider named. Closes #7, ask @alice.' } })(it)])
  const missing = scripted({ config: CONSENTED }, (it) => [agent({ fill: false })(it), agent({ fill: false })(it)])

  const outcome = await host.start(STORY)

  assert.equal((await missing.start(STORY)).code, 'missing-outputs')
  const told = missing.codeHost.comments[0].body
  assert.ok(told.includes('\n### skraft · checkout — run blocked\n\nblocked (missing-outputs)\n\n- [ ] RESEARCH — stopped here\n'), told)
  assert.equal(told.includes(TRACKING), false, told)
  assert.equal(outcome.code, 'agent-blocked')
  assert.deepEqual(kept(host), ['keep comment #42'])
  const { body } = host.codeHost.comments[0]
  assert.equal(body.slice(0, body.indexOf('<details>')), [
    MARKER,
    '### skraft · checkout — run blocked',
    '',
    'blocked (agent-blocked)',
    '',
    '- [ ] RESEARCH — stopped here',
    '- [ ] DESIGN',
    '- [ ] DISTILL',
    '- [ ] DELIVER',
    '- [ ] PUBLISH',
    '',
    'Reviews: none yet.',
    '',
    'Quality gates: none ran.',
    '',
    'Pull request: none opened or updated by this run.',
    '',
    'Total: 3 attempts, 0 retries, 0 s, cost -.',
    '',
    `Run report and evidence: \`.copilot-tracking/skraft-plans/${SLUG}/\``,
    '',
    '',
  ].join('\n'))
})

test('a review told after the run was stopped twice keeps the phase of its own step, not of the step the run went on with', async () => {
  const dot = edit(BUILT_IN_WORKFLOW,
    ['  exit     [shape=Msquare]', `  exit     [shape=Msquare]\n${reviewNodes('adr_review')}`],
    ['  adr -> distill   [label="RATIFIED"]', `  adr -> adr_review_lenses   [label="RATIFIED"]\n${reviewEdges('adr_review', 'distill', 'distill')}`])
  const host = scripted({ config: { ...CONSENTED, workflow: 'skraft-workflow.dot' }, files: { 'skraft-workflow.dot': dot } }, (it) => nominal(it, REFS_42))
  host.agentRunner.review = lenses({ consistency: [says('consistency', 'pass'), says('consistency', 'fail', [finding('F1', 'blocker', 'the ADR contradicts the context map')])] })
  const keep = host.codeHost.keepIssueComment.bind(host.codeHost)
  let interruptions = 2
  host.codeHost.keepIssueComment = async (request) => {
    if (interruptions === 0 || !host.events().some((event) => event.outcome === 'needs-rework')) return keep(request)
    interruptions -= 1
    throw new Error('host interrupted')
  }

  await assert.rejects(host.start(STORY), /host interrupted/)
  await assert.rejects(host.run(), /host interrupted/)
  assert.equal((await host.run()).status, 'done')

  const rework = eventsOf(host, 'issue.commented').find((event) => event.kind === 'rework')
  assert.deepEqual({ phase: rework.phase, step: rework.step }, { phase: 'DESIGN', step: 'adr_review' })
})
