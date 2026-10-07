// Unit tests: the report boundaries step of RunPipeline (application/pipeline/report-boundaries.mjs)
// with hand-written in-memory ports — consent asked once, the specialists' addendum, the
// designer's handoff kept, references read once before rendering, chat summary, and the
// pending publication retried at DONE. Templates are tiny test templates.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReportBoundaries } from '../../../plugins/skraft-framework/src/application/pipeline/report-boundaries.mjs'

const SLUG = 'checkout'
const TODAY = '2026-10-07'
const PREFIX = `.copilot-tracking/skraft-plans/${SLUG}/`
const REVISION = 'e8b963a1f70c4d229e10b348a69f5c71d231809e'
const sha = (text) => createHash('sha256').update(text, 'utf8').digest('hex')
const PLAN = `${PREFIX}details/test-plan.md`
const QUALITY = `${PREFIX}evidence/${TODAY}/qg.json`
const CHANGES = `${PREFIX}changes/change-log.md`
const STDOUT = `${PREFIX}evidence/${TODAY}/g1.stdout`
const EXIT = `${PREFIX}evidence/${TODAY}/g1.exit`
const REVIEW_PATH = `reviews/${TODAY}/deliver-review-1.md`
const TEMPLATES = {
  'skills/qa-reporting/assets/templates/forecast.md': 'FORECAST {{title}}\n{{testPlan}}',
  'skills/qa-reporting/assets/templates/outcome.md': 'OUTCOME {{title}}\n{{gates}}\nREVIEW:{{review}}\nCHANGES:{{changes}}',
}
const LOCAL = {
  confirmed: true, repo: null, branch: 'feature/checkout', prNumber: null, issueNumber: null,
  destinations: { pr: false, issue: 'none', chat: false }, maxMedia: 1, allowDraftPr: false,
}
const CHAT = { ...LOCAL, destinations: { ...LOCAL.destinations, chat: true } }
const PR = {
  confirmed: true, provider: 'github', host: 'github.com', repo: 'acme/shop', branch: 'feature/checkout', prNumber: 12,
  issueNumber: null, destinations: { pr: true, issue: 'none', chat: false }, maxMedia: 0, allowDraftPr: false,
}

const forecastData = (overrides = {}) => ({
  kind: 'forecast', story: SLUG, title: 'Pay by card', revision: REVISION, language: 'en', maxMedia: 0,
  impact: { expected: 'Card payments accepted' },
  criteria: [{ id: 'AC-1', description: 'Pay by card', test: 'tests/pay.test.mjs', evidence: PLAN }],
  limitations: [], media: [], testPlanRef: PLAN, ...overrides,
})
const outcomeData = () => forecastData({
  kind: 'outcome', impact: { expected: 'Card payments accepted', actual: 'Accepted' }, testPlanRef: undefined,
  qualityEvidenceRef: QUALITY, changeLogRef: CHANGES,
  criteria: [{ id: 'AC-1', description: 'Pay by card', test: 'tests/pay.test.mjs' }],
})
const quality = () => JSON.stringify({
  $schema: 'quality-gates-evidence/v3', story: SLUG, produced_at: `${TODAY}T10:00:00Z`, producer: 'engineer',
  tech_adapter: 'node', repo_root_rev: REVISION, commits_covered: [], test_integrity: { cycles: [] },
  gates: [{ id: 'G1', label: 'Acceptance', status: 'pass', command_executed: 'node --test', stdout_ref: STDOUT, exit_code_ref: EXIT, stdout_sha256: sha('ok\n'), stdout_tail: 'ok\n' }],
})

const setup = ({ preferences = null, state, files = {}, repository = {}, answer = null, configured = { ok: true } } = {}) => {
  const tracking = new Map(Object.entries(files))
  const logs = []
  const asked = []
  const repoReads = []
  const listed = []
  const templates = []
  const transportCalls = []
  const configuredWith = []
  const trackingWrites = []
  const deps = {
    stateService: {
      get: async () => (state !== undefined ? state : { value: { userPreferences: { reporting: preferences } } }),
      configureReporting: async (slug, prefs) => { configuredWith.push(prefs); return configured },
    },
    trackingStore: {
      list: async () => { listed.push(true); return [...tracking.keys()] },
      read: async (slug, path) => tracking.get(path),
      write: async (slug, path, text) => { trackingWrites.push(path); tracking.set(path, text) },
      prefix: (slug) => `.copilot-tracking/skraft-plans/${slug}/`,
    },
    repositoryReader: { read: async (ref) => { repoReads.push(ref); return repository[ref] ?? null } },
    templateReader: { read: async (path) => { templates.push(path); return TEMPLATES[path] } },
    sourceControl: { remoteUrl: async () => 'https://github.com/acme/shop.git', currentBranch: async () => 'feature/checkout' },
    hasher: { sha256Sync: sha },
    reportTransport: {
      observe: async ({ packet }) => { transportCalls.push(['observe', packet.destination, packet.body]); return null },
      publish: async () => { transportCalls.push(['publish']); return null },
    },
    tryAsk: async (slug, checkpoint) => { asked.push(checkpoint); return answer },
    progress: { log: (line) => logs.push(line) },
    time: { isoString: () => `${TODAY}T10:00:00.000Z` },
  }
  return {
    boundaries: createReportBoundaries(deps), deps, tracking, logs, asked, repoReads, listed, templates,
    transportCalls, configuredWith, trackingWrites,
  }
}

test('report boundaries: consent is never asked again once preferences are saved', async () => {
  const host = setup({ preferences: LOCAL })
  await host.boundaries.ensureConsent(SLUG, { issue: 42 })
  assert.deepEqual(host.asked, [])
  assert.deepEqual(host.logs, [])
})

test('report boundaries: consent is asked when the state holds no reporting preferences yet, with every option', async () => {
  for (const state of [{}, { value: {} }, { value: { userPreferences: {} } }]) {
    const host = setup({ state })
    await host.boundaries.ensureConsent(SLUG, { issue: 42 })
    assert.equal(host.asked.length, 1, JSON.stringify(state))
    assert.equal(host.asked[0].key, 'reporting:consent')
    assert.deepEqual(host.asked[0].options, ['local', 'chat', 'pr+issue+chat', 'pr+chat'])
    assert.match(host.asked[0].question, /github github\.com acme\/shop, branch feature\/checkout, issue #42/)
    assert.deepEqual(host.logs, ['reporting: no destination confirmed — reports stay local (answer reporting:consent to choose)'])
  }
})

test('report boundaries: a valid consent is saved and logged; a store refusal is logged with its reason', async () => {
  const saved = setup({ answer: 'pr+chat pr=#12' })
  await saved.boundaries.ensureConsent(SLUG, { issue: 42 })
  assert.equal(saved.configuredWith.length, 1)
  assert.deepEqual(saved.configuredWith[0].destinations, { pr: true, issue: 'none', chat: true })
  assert.deepEqual(saved.logs, ['reporting: pr+chat pr=#12'])

  const refused = setup({ answer: 'chat', configured: { ok: false, error: { reason: 'state is locked' } } })
  await refused.boundaries.ensureConsent(SLUG, {})
  assert.deepEqual(refused.logs, ['reporting: not saved — state is locked'])

  const garbled = setup({ answer: 'everywhere' })
  await garbled.boundaries.ensureConsent(SLUG, {})
  assert.deepEqual(garbled.logs, ['reporting: "everywhere" refused — "everywhere" is not a destination; answer reporting:consent again'])
  assert.deepEqual(garbled.configuredWith, [])
})

test('report boundaries: only DISTILL and DELIVER get a reporting addendum; other phases read nothing', async () => {
  const host = setup({ preferences: CHAT })
  for (const phase of ['DESIGN', 'DISCUSS', 'DONE']) assert.equal(await host.boundaries.addendum(SLUG, phase), null)
  assert.deepEqual(host.listed, [])

  const distill = await host.boundaries.addendum(SLUG, 'DISTILL')
  assert.equal(distill.title, 'Reporting (qa-reporting)')
  assert.match(distill.body, /at most 1 embedded media/)
  assert.match(distill.body, new RegExp(`${PREFIX.replace(/[.]/g, '\\.')}reporting/${TODAY}/forecast-data\\.json`))
  const deliver = await host.boundaries.addendum(SLUG, 'DELIVER')
  assert.match(deliver.body, /outcome-data\.json/)
  assert.equal(host.listed.length, 2)
})

test('report boundaries: the designer handoff is kept only when it says something', async () => {
  const host = setup()
  for (const text of [undefined, null, 42, '', '   \n\t']) await host.boundaries.keepHandoff(SLUG, text)
  assert.deepEqual(host.trackingWrites, [])
  await host.boundaries.keepHandoff(SLUG, 'tests/pay.acceptance.test.mjs')
  assert.deepEqual(host.trackingWrites, [`reporting/${TODAY}/distill-handoff.md`])
  assert.equal(host.tracking.get(`reporting/${TODAY}/distill-handoff.md`), 'tests/pay.acceptance.test.mjs')
})

test('report boundaries: a forecast reads each repository reference once and renders it, without consent stays local', async () => {
  const host = setup({
    files: { [`reporting/${TODAY}/forecast-data.json`]: JSON.stringify(forecastData()) },
    repository: { [PLAN]: 'The approved plan' },
  })
  const result = await host.boundaries.report(SLUG, 'forecast')

  assert.deepEqual(result, { markdownPath: `reporting/${TODAY}/forecast.md`, results: [] })
  assert.deepEqual(host.repoReads, [PLAN])
  assert.deepEqual(host.templates, ['skills/qa-reporting/assets/templates/forecast.md'])
  const markdown = host.tracking.get(`reporting/${TODAY}/forecast.md`)
  assert.match(markdown, /^FORECAST Pay by card\n/)
  assert.match(markdown, /\n\nThe approved plan$/)
  assert.deepEqual(host.logs, [])
  assert.deepEqual(host.transportCalls, [])
})

test('report boundaries: a forecast never reads the proofs of a quality evidence it names', async () => {
  const host = setup({
    files: { [`reporting/${TODAY}/forecast-data.json`]: JSON.stringify(forecastData({ qualityEvidenceRef: QUALITY })) },
    repository: { [PLAN]: 'The approved plan', [QUALITY]: quality() },
  })
  await host.boundaries.report(SLUG, 'forecast')
  assert.deepEqual(host.repoReads, [PLAN, QUALITY])
})

test('report boundaries: an outcome binds the review, reads its proofs and verifies them with the hasher', async () => {
  const host = setup({
    preferences: LOCAL,
    files: { [`reporting/${TODAY}/outcome-data.json`]: JSON.stringify(outcomeData()) },
    repository: { [QUALITY]: quality(), [`${PREFIX}${REVIEW_PATH}`]: 'Review text', [CHANGES]: 'Change text', [STDOUT]: 'ok\n', [EXIT]: '0\n' },
  })
  const result = await host.boundaries.report(SLUG, 'outcome', REVIEW_PATH)

  assert.deepEqual(result, { markdownPath: `reporting/${TODAY}/outcome.md`, results: [] })
  assert.deepEqual(host.repoReads, [QUALITY, `${PREFIX}${REVIEW_PATH}`, CHANGES, STDOUT, EXIT])
  const markdown = host.tracking.get(`reporting/${TODAY}/outcome.md`)
  assert.match(markdown.split('\n').find((line) => line.startsWith('| G1 |')), /\| pass \|/)
  assert.match(markdown, /REVIEW:.*\n\nReview text\n/)
  assert.deepEqual(host.logs, [])
})

test('report boundaries: chat preferences log the summary; a remote destination logs its pending result', async () => {
  const chat = setup({ preferences: CHAT, files: { [`reporting/${TODAY}/forecast-data.json`]: JSON.stringify(forecastData()) } })
  assert.deepEqual((await chat.boundaries.report(SLUG, 'forecast')).results, [])
  assert.deepEqual(chat.logs, [`forecast report for checkout: ${PREFIX}reporting/${TODAY}/forecast.md`])

  const pr = setup({ preferences: PR, files: { [`reporting/${TODAY}/forecast-data.json`]: JSON.stringify(forecastData()) } })
  const { results } = await pr.boundaries.report(SLUG, 'forecast')
  assert.deepEqual(results, [{ destination: 'pr', status: 'pending', reason: 'no trustworthy snapshot of the target' }])
  assert.deepEqual(pr.logs, [`forecast report for checkout: ${PREFIX}reporting/${TODAY}/forecast.md\n  pr: pending — no trustworthy snapshot of the target`])
})

test('report boundaries: no data written renders nothing; a failing store is logged, even when it rejects with no error', async () => {
  const none = setup()
  assert.equal(await none.boundaries.report(SLUG, 'outcome'), null)
  assert.deepEqual(none.logs, ['outcome report: no outcome data was written; nothing rendered'])

  const failing = setup({ files: { [`reporting/${TODAY}/forecast-data.json`]: JSON.stringify(forecastData()) } })
  failing.deps.templateReader.read = async () => { throw new Error('template gone') }
  assert.equal(await failing.boundaries.report(SLUG, 'forecast'), null)
  assert.deepEqual(failing.logs, ['forecast report not rendered: template gone'])

  const bare = setup({ files: { [`reporting/${TODAY}/forecast-data.json`]: JSON.stringify(forecastData()) } })
  bare.deps.templateReader.read = async () => { throw null } // eslint-disable-line no-throw-literal
  assert.equal(await bare.boundaries.report(SLUG, 'forecast'), null)
  assert.deepEqual(bare.logs, ['forecast report not rendered: null'])
})

test('report boundaries: at DONE, nothing is retried without a ready pending packet and its Markdown', async () => {
  for (const [label, files] of [
    ['no pending file', {}],
    ['unreadable', { 'reporting/pending.json': 'not json' }],
    ['null', { 'reporting/pending.json': 'null' }],
    ['empty', { 'reporting/pending.json': '{}' }],
    ['not ready', { 'reporting/pending.json': JSON.stringify({ packet: { status: 'pending', kind: 'forecast', story: SLUG } }), [`reporting/${TODAY}/forecast.md`]: 'Forecast' }],
    ['no markdown', { 'reporting/pending.json': JSON.stringify({ packet: { status: 'ready', kind: 'forecast', story: SLUG } }), [`reporting/${TODAY}/outcome.md`]: 'Outcome' }],
  ]) {
    const host = setup({ preferences: PR, files })
    await host.boundaries.resumePending(SLUG)
    assert.deepEqual(host.logs, [], label)
    assert.deepEqual(host.transportCalls, [], label)
  }
})

test('report boundaries: at DONE, a ready pending packet is published again from its newest Markdown', async () => {
  const host = setup({
    preferences: PR,
    files: {
      'reporting/2026-10-01/forecast.md': 'Old forecast',
      [`reporting/${TODAY}/forecast.md`]: 'New forecast',
      [`reporting/${TODAY}/forecast-data.json`]: '{}',
      'reporting/pending.json': JSON.stringify({ packet: { status: 'ready', kind: 'forecast', story: SLUG, destination: 'pr' } }),
    },
  })
  await host.boundaries.resumePending(SLUG)

  assert.equal(host.logs[0], 'forecast report: publication pending — trying again')
  assert.equal(host.logs[1], `forecast report for checkout: ${PREFIX}reporting/${TODAY}/forecast.md\n  pr: pending — no trustworthy snapshot of the target`)
  assert.equal(host.transportCalls.length, 1)
  assert.match(host.transportCalls[0][2], /\n\nNew forecast$/)
})

test('report boundaries: a failing retry at DONE is logged, never thrown', async () => {
  const host = setup({ preferences: PR, files: { 'reporting/pending.json': JSON.stringify({ packet: { status: 'ready', kind: 'forecast' } }) } })
  host.deps.trackingStore.list = async () => { throw new Error('disk gone') }
  await host.boundaries.resumePending(SLUG)
  assert.deepEqual(host.logs, ['publication resume failed: disk gone'])

  const bare = setup({ preferences: PR, files: { 'reporting/pending.json': JSON.stringify({ packet: { status: 'ready', kind: 'forecast' } }) } })
  bare.deps.trackingStore.list = async () => { throw undefined } // eslint-disable-line no-throw-literal
  await bare.boundaries.resumePending(SLUG)
  assert.deepEqual(bare.logs, ['publication resume failed: undefined'])
})
