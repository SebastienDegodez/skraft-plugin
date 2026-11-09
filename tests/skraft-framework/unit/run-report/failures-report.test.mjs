import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ScriptedMachine } from '../support/in-memory-host.mjs'
import { agent, API, green, scripted, SLUG, tddCycle, TRACKING } from '../support/pipeline-host.mjs'

const upToDeliver = (it) => [agent()(it), agent()(it), agent()(it)]
const reportOf = (host) => host.tracking.files.get(`${SLUG}/run-report.md`)
const sectionOf = (report, title) => report.split(`\n${title}\n\n`)[1].split(/\n\n(?=## |Started at )/)[0]

test('a run that waits on a human tells in its report the question and how to answer it, each commit and its verdict, and the failures sent back by step', async () => {
  const machine = new ScriptedMachine({ exits: { '. $ dotnet test': 1 } })
  const host = scripted({ machine }, (it) => [agent({ fill: false })(it), ...upToDeliver(it), ...[1, 2, 3, 4].map((n) => agent({ work: n === 1 ? green() : tddCycle(SLUG, `Pass${n}`) })(it))])

  const outcome = await host.start()

  const report = reportOf(host)
  const question = host.events().filter(({ type }) => type === 'question.asked').at(-1)
  assert.equal(outcome.code, 'blocked')
  assert.equal(sectionOf(report, '## Waiting on'), [
    'Question deliver-1, on deliver:',
    '',
    ...question.text.split('\n').map((line) => `> ${line}`),
    '',
    'Answer with `skraft decide deliver-1 "<instruction>"|STOP`.',
  ].join('\n'))
  assert.equal(sectionOf(report, '## Commits'), [
    '| Step | Commit | Subject | Kind | Verdict |',
    '| --- | --- | --- | --- | --- |',
    '| distill | root-1 | test(checkout): scenario 1 | red | ok |',
    '| deliver | root-2 | feat(checkout): Checkout pays by card | green | ok |',
    '| deliver | root-3 | test(checkout): Pass2 pays by card | red | ok |',
    '| deliver | root-4 | feat(checkout): Pass2 pays by card | green | ok |',
    '| deliver | root-5 | refactor(checkout): name the card payment | refactor | ok |',
    '| deliver | root-6 | test(checkout): Pass3 pays by card | red | ok |',
    '| deliver | root-7 | feat(checkout): Pass3 pays by card | green | ok |',
    '| deliver | root-8 | refactor(checkout): name the card payment | refactor | ok |',
    '| deliver | root-9 | test(checkout): Pass4 pays by card | red | ok |',
    '| deliver | root-10 | feat(checkout): Pass4 pays by card | green | ok |',
    '| deliver | root-11 | refactor(checkout): name the card payment | refactor | ok |',
  ].join('\n'))
  assert.equal(sectionOf(report, '## Refusals'), [
    '| Step | Times | First failure |',
    '| --- | --- | --- |',
    '| research | 1 | missing research/2026-10-11/checkout-research.md |',
    `| gates | 4 | api/test: exited 1 (evidence: ${TRACKING}/gates/api/test-1.log) |`,
  ].join('\n'))
  assert.ok(question.text.endsWith(`\nThe run so far (commits, refusals, incidents): ${TRACKING}/run-report.md`), question.text)
})

test('an incident asked of a human stays in the report with its cause, its log and the answer it got; a table cell holds no pipe nor line break of a failure', async () => {
  const machine = new ScriptedMachine({ exits: { '. $ dotnet test': 137 } })
  const host = scripted({ machine }, (it) => [...upToDeliver(it), agent({ work: green() })(it)])

  await host.start()
  const waiting = sectionOf(reportOf(host), '## Incidents')
  machine.exits['. $ dotnet test'] = 0
  await host.decide({ answer: 'RETRY' })
  const outcome = await host.run()

  const row = (answer) => ['| Question | Step | Cause | Output | Answer |', '| --- | --- | --- | --- | --- |', `| gates-1 | gates | unknown | ${TRACKING}/gates/api/test-1.log | ${answer} |`].join('\n')
  assert.equal(waiting, row('waiting'))
  assert.equal(outcome.status, 'done', outcome.reason)
  assert.equal(sectionOf(reportOf(host), '## Incidents'), row('RETRY'))
  assert.ok(!reportOf(host).includes('## Waiting on'), reportOf(host))
})

test('an incident the configuration must fix, with no command run, has no log in the report', async () => {
  const UNTESTED = { ...API, commands: { build: 'dotnet build' } }
  const host = scripted({ components: [UNTESTED] }, (it) => [agent()(it), agent()(it), agent()(it)])

  await host.start()

  assert.equal(sectionOf(reportOf(host), '## Incidents'), ['| Question | Step | Cause | Output | Answer |', '| --- | --- | --- | --- | --- |', '| distill-1 | distill | config | - | waiting |'].join('\n'))
})
