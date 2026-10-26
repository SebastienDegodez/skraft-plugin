import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryCodeHost } from '../support/in-memory-host.mjs'
import { agent, nominal, REFS_42, scripted, SLUG, TRACKING } from '../support/pipeline-host.mjs'
import { ADR_1, adrText, afterDesign, architect, eventsOf } from '../support/decisions.mjs'

const CONSENTED = { publish: { pullRequest: true } }
const STORY = { story: { issue: 42, title: 'Pay by card' } }
const PHASES = ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER', 'PUBLISH']

/** What the forge was asked to comment, as `<issue> <body file>`. */
const commented = (host) => host.codeHost.comments.map(({ number, bodyFile }) => `#${number} ${bodyFile.slice(TRACKING.length + 1)}`)
/** The journaled comments: kind, phase, issue, url or reason. */
const journaled = (host) => [...eventsOf(host, 'issue.commented'), ...eventsOf(host, 'issue.comment-skipped')]
  .map(({ type, kind, phase, issue, url, reason }) => [type, kind, phase, issue, url ?? reason])

test('a run from an issue comments it once per phase it closes, then once with the summary of the run, each rendered by the engine from the journal', async () => {
  const host = scripted({ config: CONSENTED }, (it) => nominal(it, REFS_42))

  const outcome = await host.start(STORY)

  assert.equal(outcome.status, 'done')
  assert.deepEqual(commented(host), [
    '#42 issue-progress/1-RESEARCH.md', '#42 issue-progress/2-DESIGN.md', '#42 issue-progress/3-DISTILL.md',
    '#42 issue-progress/4-DELIVER.md', '#42 issue-progress/5-PUBLISH.md', '#42 issue-progress/6-summary.md',
  ])
  assert.deepEqual(host.codeHost.calls.filter((call) => !call.startsWith('comment')), ['push checkout', 'find checkout', 'create main <- checkout (draft): Pay by card at checkout'])
  assert.equal(host.codeHost.calls.indexOf('push checkout'), 4, 'the four phases before PUBLISH are commented as they close, before the branch is pushed')
  assert.equal(host.codeHost.comments[0].body, [
    '### skraft · checkout — RESEARCH closed',
    '',
    '| Step | Visits | Attempts | Retries | Time | Cost | Outcome |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
    '| publish_consent | 1 | 1 | 0 | 0 s | - | skipped |',
    '| visuals_consent | 1 | 1 | 0 | 0 s | - | skipped |',
    '| research | 1 | 1 | 0 | 0 s | - | done |',
    '',
    'Next: DESIGN.',
    '',
  ].join('\n'))
  assert.equal(host.codeHost.comments[3].body, [
    '### skraft · checkout — DELIVER closed',
    '',
    '| Step | Visits | Attempts | Retries | Time | Cost | Outcome |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
    '| deliver | 1 | 1 | 0 | 0 s | - | done |',
    '| gates | 1 | 1 | 0 | 0 s | - | pass |',
    '| mutation | 1 | 1 | 0 | 0 s | - | pass |',
    '| deliver_review | 1 | 1 | 0 | 0 s | - | approved |',
    '| visuals | 1 | 1 | 0 | 0 s | - | skipped |',
    '',
    'Next: PUBLISH.',
    '',
  ].join('\n'))
  assert.ok(host.codeHost.comments[4].body.endsWith('| publish | 1 | 1 | 0 | 0 s | - | published |\n\nNext: the end of the workflow.\n'), host.codeHost.comments[4].body)
  assert.equal(host.codeHost.comments[5].body, [
    '### skraft · checkout — run done',
    '',
    'done: PUBLISH closed',
    '',
    '- [x] RESEARCH',
    '- [x] DESIGN',
    '- [x] DISTILL',
    '- [x] DELIVER',
    '- [x] PUBLISH',
    '',
    'Pull request: #42 https://github.example.com/acme/shop/pull/42',
    '',
    'Quality gates: api/build pass, api/test pass, api/mutation pass.',
    '',
    'Total: 15 attempts, 0 retries, 0 s, cost -.',
    '',
  ].join('\n'))
  assert.equal(await host.tracking.read(SLUG, 'issue-progress/6-summary.md'), host.codeHost.comments[5].body)
  assert.deepEqual(journaled(host), [
    ...PHASES.map((phase, index) => ['issue.commented', 'phase', phase, 42, `https://github.example.com/acme/shop/issues/42#issuecomment-${index + 1}`]),
    ['issue.commented', 'summary', null, 42, 'https://github.example.com/acme/shop/issues/42#issuecomment-6'],
  ])
  assert.deepEqual(host.types().slice(-2), ['run.finished', 'issue.commented'])
  assert.ok(host.progress.lines.includes(`${SLUG}: issue #42 commented: https://github.example.com/acme/shop/issues/42#issuecomment-1`), host.progress.lines.join('\n'))
})

test('without an issue the run comments nothing; without the developer\'s consent to publish, it journals each transition skipped and asks the forge nothing', async () => {
  const noIssue = scripted({ config: CONSENTED }, (it) => nominal(it))
  assert.equal((await noIssue.start({ story: { title: 'Pay by card' } })).status, 'done')
  const declined = scripted({ config: { publish: { pullRequest: false } } }, (it) => nominal(it, REFS_42))
  assert.equal((await declined.start(STORY)).status, 'done')

  assert.deepEqual(journaled(noIssue), [])
  assert.deepEqual(await noIssue.tracking.list(SLUG, 'issue-progress'), [])
  const unconsented = 'skraft-config.json does not set publish.pullRequest to true'
  assert.deepEqual(journaled(declined), [...PHASES, null].map((phase) => ['issue.comment-skipped', phase === null ? 'summary' : 'phase', phase, 42, unconsented]))
  assert.deepEqual(await declined.tracking.list(SLUG, 'issue-progress'), [])
  assert.equal(declined.progress.lines.some((line) => line.includes('issue #42')), false, declined.progress.lines.join('\n'))
  for (const host of [noIssue, declined]) assert.deepEqual(host.codeHost.comments, [])

  await declined.workspace.write('skraft-config.json', (await declined.workspace.read('skraft-config.json')).replace('"pullRequest":false', '"pullRequest":true'))
  await declined.run()
  assert.deepEqual(declined.codeHost.comments, [], 'a consent given later tells none of the transitions already journaled')
})

test('a run started from artifacts comments the phases it ran, not those it found closed', async () => {
  const host = scripted({ config: CONSENTED }, (it) => nominal(it, REFS_42).slice(1))
  await host.tracking.write(SLUG, 'plans/2026-10-01/stories-v1.md', '# Stories\n')
  await host.tracking.write(SLUG, 'plans/2026-10-01/ac-draft-us-1.md', '# AC\n')

  assert.equal((await host.init({ fromArtifacts: true, ...STORY })).ok, true)
  assert.equal((await host.run()).status, 'done')

  assert.deepEqual(journaled(host).map(([, kind, phase]) => [kind, phase]), [...PHASES.slice(1).map((phase) => ['phase', phase]), ['summary', null]])
  assert.ok(host.codeHost.comments.at(-1).body.includes('\n- [x] RESEARCH\n- [x] DESIGN\n'), host.codeHost.comments.at(-1).body)
})

test('a comment the forge cannot take is journaled skipped with its reason, told, never tried again, and the run goes on', async () => {
  const unreachable = scripted({ config: CONSENTED, codeHost: new InMemoryCodeHost({ unavailable: 'gh, the GitHub CLI, is not installed' }) }, (it) => nominal(it, REFS_42))
  const refusing = scripted({ config: CONSENTED, codeHost: new InMemoryCodeHost({ fails: { comment: 'gh could not comment issue #42 on github.example.com/acme/shop' } }) }, (it) => nominal(it, REFS_42))

  assert.equal((await unreachable.start(STORY)).status, 'done')
  assert.equal((await refusing.start(STORY)).status, 'done')

  assert.deepEqual(unreachable.codeHost.calls.filter((call) => call.startsWith('comment')), [])
  assert.deepEqual(journaled(unreachable), [...PHASES, null].map((phase) => ['issue.comment-skipped', phase === null ? 'summary' : 'phase', phase, 42, 'gh, the GitHub CLI, is not installed']))
  assert.equal(await unreachable.tracking.read(SLUG, 'issue-progress/1-RESEARCH.md') !== null, true, 'the comment stays in the tracking folder')
  assert.ok(unreachable.progress.lines.includes(`${SLUG}: issue #42 not commented (RESEARCH closed): gh, the GitHub CLI, is not installed`), unreachable.progress.lines.join('\n'))
  assert.ok(unreachable.progress.lines.includes(`${SLUG}: issue #42 not commented (summary): gh, the GitHub CLI, is not installed`), unreachable.progress.lines.join('\n'))
  assert.equal(refusing.codeHost.calls.filter((call) => call.startsWith('comment')).length, 6)
  assert.deepEqual(journaled(refusing).map(([type, kind, phase, , reason]) => [type, kind, phase, reason]).at(-1), ['issue.comment-skipped', 'summary', null, 'gh could not comment issue #42 on github.example.com/acme/shop'])

  await refusing.run()
  assert.equal(refusing.codeHost.calls.filter((call) => call.startsWith('comment')).length, 6, 'a run of a pipeline already done tries no comment again')
})

test('a run that waits on a human comments the phases it closed; the run that goes on after the answer comments only the next ones', async () => {
  const host = scripted({ config: CONSENTED, files: {} }, (it) => [agent()(it), architect({ [ADR_1]: adrText() }, REFS_42)(it), ...afterDesign(it, REFS_42)])

  assert.equal((await host.start(STORY)).status, 'waiting')
  assert.deepEqual(journaled(host).map(([, kind, phase]) => [kind, phase]), [['phase', 'RESEARCH']])
  assert.equal((await host.run()).status, 'waiting')
  assert.equal(host.codeHost.comments.length, 1)

  await host.decide({ key: 'adr-1', answer: 'RATIFIED' })
  assert.equal((await host.run()).status, 'done')

  assert.deepEqual(journaled(host).map(([, kind, phase]) => [kind, phase]), [...PHASES.map((phase) => ['phase', phase]), ['summary', null]])
  assert.deepEqual(commented(host).map((line) => line.split('/')[1]), ['1-RESEARCH.md', '2-DESIGN.md', '3-DISTILL.md', '4-DELIVER.md', '5-PUBLISH.md', '6-summary.md'])
})

test('a blocked run is summarised where it stopped, and what an agent wrote reaches the issue closing nothing and mentioning nobody', async () => {
  const host = scripted({ config: CONSENTED }, (it) => [agent({ result: { status: 'blocked', summary: 'No provider named. Closes #7, ask @alice.' } })(it)])

  const outcome = await host.start(STORY)

  assert.equal(outcome.code, 'agent-blocked')
  assert.deepEqual(commented(host), ['#42 issue-progress/1-summary.md'])
  assert.equal(host.codeHost.comments[0].body, [
    '### skraft · checkout — run blocked',
    '',
    'blocked: solution-researcher is blocked: No provider named. `Closes #7`, ask `@alice`.',
    '',
    '- [ ] RESEARCH — stopped here',
    '- [ ] DESIGN',
    '- [ ] DISTILL',
    '- [ ] DELIVER',
    '- [ ] PUBLISH',
    '',
    'Pull request: none opened by this run.',
    '',
    'Quality gates: none ran.',
    '',
    'Total: 3 attempts, 0 retries, 0 s, cost -.',
    '',
  ].join('\n'))
})
