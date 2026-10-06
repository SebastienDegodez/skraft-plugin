// Use-case tests: the report boundaries RunPipeline runs (report-boundaries.mjs) — consent,
// the specialists' reporting addendum, forecast and outcome rendered from producer data,
// published through the ReportTransport port (a simulated GitHub here).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRunPipeline } from '../../../plugins/skraft-framework/src/application/pipeline/run-pipeline.mjs'
import { createFakeHost, CONFIG, TODAY } from './fake-host.mjs'

const SLUG = 'checkout'
const STORY = { issue: 42, title: 'Pay by card' }
const P = CONFIG.phaseAgents
const REVISION = 'a'.repeat(40)
const runOnce = (host) => createRunPipeline(host.dependencies(SLUG)).run({ slug: SLUG, story: STORY })

const forecast = {
  kind: 'forecast', story: SLUG, title: 'Pay by card', revision: REVISION, language: 'en',
  impact: { expected: 'Card payments accepted; source: test plan' },
  criteria: [{ id: 'AC-1', description: 'Pay by card', test: 'Checkout accepts a valid card' }],
  limitations: [], media: [], maxMedia: 0,
}
const outcome = { ...forecast, kind: 'outcome', impact: { expected: forecast.impact.expected, actual: 'Accepted in AC-1' } }
const PR_AND_ISSUE = 'pr+issue+chat pr=#12'

test('reporting: the consent is asked once, shows the scope read from git, and is saved as preferences', async () => {
  const host = createFakeHost({ consent: null, answers: { 'reporting:consent': [PR_AND_ISSUE] } })
  assert.equal((await runOnce(host)).status, 'done')

  const [question] = host.questions
  assert.equal(question.key, 'reporting:consent')
  assert.match(question.question, /github github\.com acme\/shop, branch feature\/checkout, issue #42/)
  assert.deepEqual(host.state(SLUG).userPreferences.reporting, {
    confirmed: true, provider: 'github', host: 'github.com', repo: 'acme/shop', branch: 'feature/checkout',
    prNumber: 12, issueNumber: 42, destinations: { pr: true, issue: 'link', chat: true }, maxMedia: 0, allowDraftPr: false,
  })
  await runOnce(host)
  assert.equal(host.questions.length, 1, 'never asked again')
})

test('reporting: no answer, or one that does not parse, never stops engineering — the reports stay local', async () => {
  for (const answers of [{}, { 'reporting:consent': ['everywhere please'] }]) {
    const host = createFakeHost({ consent: null, answers })
    assert.equal((await runOnce(host)).status, 'done')
    assert.equal(host.state(SLUG).userPreferences.reporting, undefined)
    assert.ok(host.logs.some((line) => /^reporting: (no destination confirmed|"everywhere please" refused)/.test(line)), host.logs.join('\n'))
  }
})

test('reporting: DISTILL and DELIVER specialists are told where their data goes; the engineer gets the designer\'s answer', async () => {
  const host = createFakeHost({ consent: 'chat media=2' })
  await runOnce(host)

  const designer = host.dispatches.find((d) => d.agent === P.DISTILL.specialist).prompt
  assert.match(designer, /## Reporting \(qa-reporting\)/)
  assert.match(designer, new RegExp(`reporting/${TODAY}/forecast-data\\.json\`, with \`"story": "checkout"\``))
  assert.match(designer, /at most 2 embedded media/)
  const engineer = host.dispatches.find((d) => d.agent === P.DELIVER.specialist).prompt
  assert.match(engineer, new RegExp(`reporting/${TODAY}/outcome-data\\.json`))
  assert.match(engineer, new RegExp(`Acceptance tests and RED evidence, as the acceptance designer returned them: \`\\.copilot-tracking/skraft-plans/checkout/reporting/${TODAY}/distill-handoff\\.md\``))
  assert.equal(host.tracking(SLUG, `reporting/${TODAY}/distill-handoff.md`), 'done')
  assert.ok(!host.dispatches.find((d) => d.agent === P.DESIGN.specialist).prompt.includes('## Reporting'))
})

test('reporting: the forecast after DISTILL and the outcome after DELIVER go to the PR, then a link to the issue', async () => {
  const host = createFakeHost({ consent: PR_AND_ISSUE, reportData: { forecast, outcome } })
  assert.equal((await runOnce(host)).status, 'done')

  const forecastMd = host.tracking(SLUG, `reporting/${TODAY}/forecast.md`)
  assert.match(forecastMd, /AC-1/)
  const [prComment, outcomeComment] = host.remote.get('pr#12')
  assert.match(prComment.body, /^<!-- skraft-report:forecast:/)
  assert.match(outcomeComment.body, /^<!-- skraft-report:outcome:/)
  const issueComments = host.remote.get('issue#42')
  assert.equal(issueComments.length, 2)
  assert.match(issueComments[0].body, new RegExp(`Report: ${prComment.url.replace(/[.#/]/g, '\\$&')}`))
  const receipt = JSON.parse(host.tracking(SLUG, 'reporting/forecast/checkout.json'))
  assert.equal(receipt.targets.pr.status, 'published')
  assert.equal(receipt.targets.issue.status, 'published')
  assert.ok(host.logs.some((line) => line.startsWith(`forecast report for checkout: .copilot-tracking/skraft-plans/checkout/reporting/${TODAY}/forecast.md`)))
  // the outcome binds the persisted DELIVER review
  assert.match(host.tracking(SLUG, `reporting/${TODAY}/outcome.md`), new RegExp(`reviews/${TODAY}/deliver-review-1\\.md`))
})

test('reporting: a publication the transport could not finish stays pending, and is tried again at DONE', async () => {
  const host = createFakeHost({ consent: 'pr pr=#12', reportData: { forecast }, transport: 'down' })
  assert.equal((await runOnce(host)).status, 'done', 'engineering never waits on a publication')
  assert.ok(host.logs.some((line) => /pr: pending — no trustworthy snapshot/.test(line)), host.logs.join('\n'))
  assert.equal(JSON.parse(host.tracking(SLUG, 'reporting/pending.json')).packet.kind, 'forecast')

  const retry = createFakeHost({ consent: 'pr pr=#12' })
  // same disk, transport back up
  const deps = { ...retry.dependencies(SLUG), stateReader: host.dependencies(SLUG).stateReader, stateWriter: host.dependencies(SLUG).stateWriter, trackingStore: host.dependencies(SLUG).trackingStore }
  const outcomeOfRetry = await createRunPipeline(deps).run({ slug: SLUG, story: STORY })
  assert.equal(outcomeOfRetry.status, 'done')
  assert.equal(retry.remote.get('pr#12').length, 1)
  assert.deepEqual(JSON.parse(host.tracking(SLUG, 'reporting/pending.json')), {})
})

test('reporting: a re-render of the same report is unchanged remotely, never a second comment', async () => {
  const host = createFakeHost({ consent: 'pr pr=#12', reportData: { forecast } })
  await runOnce(host)
  assert.deepEqual(JSON.parse(host.tracking(SLUG, 'reporting/pending.json')), {})
  // a pending packet left for the same report makes the DONE run publish it again: unchanged
  await host.dependencies(SLUG).trackingStore.write(SLUG, 'reporting/pending.json', JSON.stringify({ packet: { status: 'ready', kind: 'forecast', story: SLUG, destination: 'pr' } }))
  await runOnce(host)
  assert.equal(host.remote.get('pr#12').length, 1)
  assert.deepEqual(host.transportCalls.slice(-2), [['observe', 'pr'], ['unchanged', 'pr']])
})

test('reporting: a blocked DELIVER still renders its outcome; missing data renders nothing and says so', async () => {
  const host = createFakeHost({
    consent: 'chat', reportData: { outcome },
    verdicts: { DELIVER: ['REJECTED'] }, answers: { 'rejected:DELIVER': ['stop'] },
  })
  const result = await runOnce(host)
  assert.equal(result.status, 'blocked')
  assert.match(host.tracking(SLUG, `reporting/${TODAY}/outcome.md`), /Accepted in AC-1/)
  assert.ok(host.logs.some((line) => /^forecast report: no forecast data was written/.test(line)))
})

test('reporting: data a producer got wrong is not rendered, and engineering goes on', async () => {
  const host = createFakeHost({ consent: 'chat', reportData: { forecast: { ...forecast, revision: 'HEAD' } } })
  assert.equal((await runOnce(host)).status, 'done')
  assert.equal(host.tracking(SLUG, `reporting/${TODAY}/forecast.md`), undefined)
  assert.ok(host.logs.some((line) => /^forecast report not rendered: Invalid report revision/.test(line)))
})
