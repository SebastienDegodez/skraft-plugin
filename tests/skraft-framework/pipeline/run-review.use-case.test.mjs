// Use-case tests of the DELIVER review run as code (application/pipeline/review/run-review.mjs),
// driven through RunPipeline in review mode "code" on the in-memory host (fake-host.mjs),
// whose lenses answer as scripted.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRunPipeline } from '../../../plugins/skraft-framework/src/application/pipeline/run-pipeline.mjs'
import { createRunReview } from '../../../plugins/skraft-framework/src/application/pipeline/review/run-review.mjs'
import { readReviewOutcome } from '../../../plugins/skraft-framework/src/domain/pipeline/review-outcome.mjs'
import { createFakeHost, CONFIG, PLUGIN_ROOT, TODAY, lensDocument } from './fake-host.mjs'

const SLUG = 'checkout'
const STORY = { issue: 42, title: 'Pay by card' }
const P = CONFIG.phaseAgents
const PREFIX = `.copilot-tracking/skraft-plans/${SLUG}/`
const CORE = ['quality-gates-lens', 'architecture-boundaries-lens', 'test-integrity-lens', 'cold-reader-lens']

const runOnce = async (host) => createRunPipeline(host.dependencies(SLUG)).run({ slug: SLUG, story: STORY })
const codeHost = (options = {}) => createFakeHost({ reviewMode: 'code', ...options })
const deliverDispatches = (host) => host.dispatches.filter((d) => d.phase === 'DELIVER')
const lensPrompt = (host, agent) => host.dispatches.find((d) => d.agent === agent).prompt

test('run-review: every lens passes — the pipeline dispatches the lenses, not the reviewer, and reaches DONE', async () => {
  const host = codeHost()
  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'done')
  assert.deepEqual(deliverDispatches(host).map((d) => d.agent), [P.DELIVER.specialist, ...CORE])
  assert.ok(!host.agentsCalled().includes(P.DELIVER.reviewer), 'no reviewer agent in code mode')
  for (const d of deliverDispatches(host).slice(1)) {
    assert.equal(d.role, 'lens')
    assert.match(d.label, /^DELIVER:review:1:[a-z-]+:1$/)
  }

  const reviewPath = `reviews/${TODAY}/deliver-review-1.md`
  assert.deepEqual(host.state(SLUG).reviewArtifacts.DELIVER, [reviewPath])
  const review = host.tracking(SLUG, reviewPath)
  assert.equal(readReviewOutcome(review).verdict, 'APPROVED')
  assert.match(review, /status: "APPROVED"/)
  assert.match(review, /reviewed_sha: "sha2"/)
  assert.match(review, /summary: "APPROVED: 4 lenses pass\."/)
  assert.equal((review.match(/- lens: /g) ?? []).length, 4)
})

test('run-review: the agent mode stays the default — the reviewer agent reviews DELIVER', async () => {
  const host = createFakeHost()
  await runOnce(host)
  assert.deepEqual(deliverDispatches(host).map((d) => d.agent), [P.DELIVER.specialist, P.DELIVER.reviewer])
})

test('run-review: what the lenses read is written beside the review, and each lens gets only its inputs', async () => {
  const host = codeHost()
  await runOnce(host)

  const qg = JSON.parse(host.tracking(SLUG, `reviews/${TODAY}/qg-verify-s1.json`))
  assert.equal(qg.verdict, 'pass')
  assert.ok(Array.isArray(qg.findings))
  assert.match(host.tracking(SLUG, `reviews/${TODAY}/diff-s1.patch`), /^diff --git a\/src\/Checkout\/Payment\.cs/)
  assert.equal(host.tracking(SLUG, `reviews/${TODAY}/files-s1.txt`), 'M\tsrc/Checkout/Payment.cs\n')
  assert.equal(host.tracking(SLUG, `reviews/${TODAY}/commits-s1.txt`), 'no commit between sha1 and sha2\n')
  assert.ok(host.ranges.some(({ base, rev }) => base === 'sha1' && rev === 'sha2'), 'commits read from the DELIVER base to HEAD')

  const cold = lensPrompt(host, 'cold-reader-lens')
  assert.match(cold, new RegExp(`\`${PREFIX}reviews/${TODAY}/diff-s1\\.patch\``))
  assert.match(cold, new RegExp(`\`${PREFIX}reviews/${TODAY}/files-s1\\.txt\``))
  assert.doesNotMatch(cold, /test-plan|contracts|change-log|qg-verify|\.feature/, 'the cold reader gets no producer context')

  const quality = lensPrompt(host, 'quality-gates-lens')
  for (const path of [`reviews/${TODAY}/qg-verify-s1.json`, `reviews/${TODAY}/commits-s1.txt`, `evidence/${TODAY}/s1/qg-s1.json`]) {
    assert.ok(quality.includes(`\`${PREFIX}${path}\``), path)
  }
  assert.match(lensPrompt(host, 'architecture-boundaries-lens'), /ADR index: `docs\/adr\/decisions-index\.md`/)
  assert.match(lensPrompt(host, 'test-integrity-lens'), /Feature file: `[^`]+\.feature`/)
})

test('run-review: a blocker sends DELIVER back to the engineer with the review, then a second review approves', async () => {
  const blocker = lensDocument('test-integrity', { verdict: 'fail', defects: [{ severity: 'blocker', description: 'tautological: Assert.True(true) cannot fail' }] })
  const host = codeHost({ lensAnswers: { 'test-integrity': [blocker] } })
  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'done')
  const agents = deliverDispatches(host).map((d) => d.agent)
  assert.deepEqual(agents, [P.DELIVER.specialist, ...CORE, P.DELIVER.specialist, ...CORE])
  const first = host.tracking(SLUG, `reviews/${TODAY}/deliver-review-1.md`)
  assert.equal(readReviewOutcome(first).verdict, 'NEEDS_REWORK')
  assert.match(first, /Minority upheld: test-integrity fail \(1 blocker\)/)
  const rework = deliverDispatches(host).filter((d) => d.agent === P.DELIVER.specialist)[1]
  assert.match(rework.prompt, /tautological: Assert\.True\(true\) cannot fail/, 'the engineer reworks from the review')
  assert.ok(deliverDispatches(host).filter((d) => d.role === 'lens').slice(4).every((d) => /^DELIVER:review:2:/.test(d.label)))
  assert.equal(readReviewOutcome(host.tracking(SLUG, `reviews/${TODAY}/deliver-review-2.md`)).verdict, 'APPROVED')
})

test('run-review: an answer that is not the lens document is refused once, with the reason, then accepted', async () => {
  const host = codeHost({ lensAnswers: { 'cold-reader': ['Looks fine to me.'] } })
  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'done')
  const cold = host.dispatches.filter((d) => d.agent === 'cold-reader-lens')
  assert.equal(cold.length, 2)
  assert.match(cold[1].label, /:cold-reader:2$/)
  assert.match(cold[1].prompt, /## Previous answer refused\nlens is null, expected "cold-reader"/)
  assert.ok(host.logs.some((line) => /cold-reader: answer refused/.test(line)))
})

test('run-review: a lens unusable twice is inconclusive — the review asks for rework instead of approving', async () => {
  const host = codeHost({ lensAnswers: { 'cold-reader': [null, 'verdict: pass', null, 'verdict: pass', null, 'verdict: pass'] } })
  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'blocked')
  assert.equal(outcome.phase, 'DELIVER')
  assert.match(outcome.reason, /retry budget exhausted/)
  const review = host.tracking(SLUG, `reviews/${TODAY}/deliver-review-1.md`)
  assert.equal(readReviewOutcome(review).verdict, 'NEEDS_REWORK')
  assert.match(review, /description: "lens output unusable after one retry: lens is null, expected \\"cold-reader\\""/)
  assert.doesNotMatch(review, /escalation:/)
})

test('run-review: an environment-only inconclusive escalates to the human instead of reworking the code', async () => {
  const environment = lensDocument('quality-gates', { verdict: 'inconclusive', defects: [{ gate: 'G6', severity: 'low', description: 'environment: Stryker could not start; re-run dotnet stryker' }] })
  const host = codeHost({ lensAnswers: { 'quality-gates': [environment] }, answers: { 'environment:DELIVER': ['stop'] } })
  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'blocked')
  assert.match(outcome.reason, /environment escalation; stopped by the human/)
  const question = host.questions.find((q) => q.key.startsWith('environment:DELIVER'))
  assert.match(question.question, /environment: Stryker could not start/)
  assert.equal(host.dispatches.filter((d) => d.agent === P.DELIVER.specialist).length, 1, 'no rework of the code')
})

test('run-review: a lens the host does not have stops the run, naming it', async () => {
  const host = codeHost({ unavailable: ['architecture-boundaries-lens'] })
  const outcome = await runOnce(host)

  assert.equal(outcome.status, 'blocked')
  assert.equal(outcome.phase, 'DELIVER')
  assert.equal(outcome.reason, 'agent "architecture-boundaries-lens" is not available')
  assert.equal(host.dispatches.filter((d) => d.agent === 'architecture-boundaries-lens').length, 1, 'no retry')
  assert.equal(host.tracking(SLUG, `reviews/${TODAY}/deliver-review-1.md`), undefined, 'no review written')
})

test('run-review: a diff that adds a mock server brings in the mock-fidelity lens', async () => {
  const host = codeHost({
    diff: 'diff --git a/tests/Checkout.IntegrationTest/PaymentTests.cs b/tests/Checkout.IntegrationTest/PaymentTests.cs\n+    var server = WireMockServer.Start();\n',
    nameStatus: 'M\ttests/Checkout.IntegrationTest/PaymentTests.cs\n',
  })
  await runOnce(host)

  const lenses = deliverDispatches(host).filter((d) => d.role === 'lens').map((d) => d.agent)
  assert.deepEqual(lenses, [...CORE, 'mock-fidelity-lens'])
  assert.equal((host.tracking(SLUG, `reviews/${TODAY}/deliver-review-1.md`).match(/- lens: /g) ?? []).length, 5)
})

test('run-review: the lenses are journaled as lens dispatches of DELIVER, with their cost', async () => {
  const host = codeHost()
  await runOnce(host)

  const journal = JSON.parse(host.tracking(SLUG, 'run.json'))
  const lenses = journal.dispatches.filter((d) => d.role === 'lens')
  assert.deepEqual(lenses.map((d) => d.agent), CORE)
  assert.ok(lenses.every((d) => d.phase === 'DELIVER' && d.usage?.credits === 1.25))
})

// ── RunReview on its own: the edges of what it can prepare ─────────────────────

const DELIVER_STATE = {
  currentPhase: 'DELIVER',
  phaseHistory: { DELIVER: { baseSha: 'aaa1111' } },
  phaseArtifacts: {
    DISTILL: ['features/checkout-pay.feature', `details/${TODAY}/test-plan-s1.md`],
    DELIVER: [`changes/${TODAY}/change-log.md`, `evidence/${TODAY}/s1/qg-s1.json`],
  },
}

// An in-memory host for RunReview alone: tracking files in a Map, scripted lens answers.
const reviewHost = ({ head = 'bbb2222', shas = [], diff = 'diff --git a/a.cs b/a.cs\n', nameStatus = 'M\ta.cs\n', answer } = {}) => {
  const files = new Map()
  const dispatches = []
  const logs = []
  const deps = {
    trackingStore: {
      write: async (slug, path, text) => { files.set(path, text) },
      prefix: (slug) => `.copilot-tracking/skraft-plans/${slug}/`,
    },
    sourceControl: {
      headSha: async () => head,
      range: async () => shas,
      commit: async (sha) => ({ exists: true, message: `feat(checkout): ${sha}\n\nSigned-off-by: E <e@x>` }),
      diff: async () => diff,
      changedFiles: async () => nameStatus,
    },
    agentRunner: {
      run: async (dispatch) => {
        dispatches.push(dispatch)
        const lens = dispatch.agent.replace(/-lens$/, '')
        return answer ? answer(dispatch, lens) : { ok: true, text: lensDocument(lens) }
      },
    },
    templateReader: { read: async (path) => readFileSync(join(PLUGIN_ROOT, path), 'utf8') },
    progress: { log: (line) => logs.push(line) },
  }
  return { review: createRunReview(deps).review, files, dispatches, logs }
}
const reviewArgs = (state = DELIVER_STATE, extra = {}) => ({
  slug: SLUG, story: STORY, state, phase: 'DELIVER', reviewPath: `reviews/${TODAY}/deliver-review-1.md`, date: TODAY, label: 'DELIVER:review:1', ...extra,
})

test('run-review alone: the covered commits are written with their full messages', async () => {
  const host = reviewHost({ shas: ['c1', 'c2'] })
  const result = await host.review(reviewArgs(DELIVER_STATE, { verification: { verdict: 'pass', findings: [] } }))

  assert.equal(result.ok, true)
  assert.equal(result.value.status, 'APPROVED')
  assert.equal(host.files.get(`reviews/${TODAY}/commits-s1.txt`),
    'commit c1\nfeat(checkout): c1\n\nSigned-off-by: E <e@x>\ncommit c2\nfeat(checkout): c2\n\nSigned-off-by: E <e@x>\n')
  assert.deepEqual(JSON.parse(host.files.get(`reviews/${TODAY}/qg-verify-s1.json`)), { verdict: 'pass', findings: [] })
  assert.ok(host.logs.includes('review (code): quality-gates, architecture-boundaries, test-integrity, cold-reader'))
})

test('run-review alone: no phase base — no commits, patch or file list; the lenses are told they are absent', async () => {
  const host = reviewHost({ head: null })
  const state = { ...DELIVER_STATE, phaseHistory: {} }
  const result = await host.review(reviewArgs(state))

  assert.equal(result.ok, true)
  assert.deepEqual([...host.files.keys()], [`reviews/${TODAY}/deliver-review-1.md`], 'only the review')
  const quality = host.dispatches.find((d) => d.agent === 'quality-gates-lens').prompt
  assert.match(quality, /qg-verify result .*: absent — none was recorded/)
  assert.match(quality, /Patch since the DELIVER base .*: absent — none was recorded/)
  assert.doesNotMatch(host.files.get(`reviews/${TODAY}/deliver-review-1.md`), /reviewed_sha/, 'no HEAD, no reviewed SHA')
})

test('run-review alone: a diff git cannot produce leaves the patch and file list out', async () => {
  const host = reviewHost({ diff: null, nameStatus: null })
  await host.review(reviewArgs())

  assert.ok(!host.files.has(`reviews/${TODAY}/diff-s1.patch`))
  assert.ok(!host.files.has(`reviews/${TODAY}/files-s1.txt`))
  assert.equal(host.files.get(`reviews/${TODAY}/commits-s1.txt`), 'no commit between aaa1111 and bbb2222\n')
})

test('run-review alone: no feature on record is said absent; no evidence log keys the files "story"', async () => {
  const host = reviewHost()
  await host.review(reviewArgs({ ...DELIVER_STATE, phaseArtifacts: {} }))

  assert.match(host.dispatches.find((d) => d.agent === 'test-integrity-lens').prompt, /Feature file: absent — none was recorded/)
  assert.ok(host.files.has(`reviews/${TODAY}/diff-story.patch`))
})

test('run-review alone: a lens that answers nothing twice says why in its refused reason', async () => {
  const host = reviewHost({ answer: (d, lens) => (lens === 'cold-reader' ? { ok: false, text: '', error: 'session closed' } : { ok: true, text: lensDocument(lens) }) })
  const result = await host.review(reviewArgs())

  assert.equal(result.value.status, 'NEEDS_REWORK')
  assert.match(host.dispatches.filter((d) => d.agent === 'cold-reader-lens')[1].prompt, /the lens returned no answer — session closed\. Answer again/)
  const cold = result.value.lenses.find(({ lens }) => lens === 'cold-reader')
  assert.equal(cold.defects[0].description, 'lens output unusable after one retry: the lens returned no answer — session closed')
})

test('run-review alone: an unavailable lens without a reason is named by its agent id', async () => {
  const host = reviewHost({ answer: () => ({ ok: false, unavailable: true }) })
  const result = await host.review(reviewArgs())

  assert.deepEqual(result.error, { code: 'LENS_UNAVAILABLE', reason: 'quality-gates-lens is not available on this host' })
})

test('run-pipeline: a code review that cannot be read back stops DELIVER instead of asking again', async () => {
  const host = codeHost()
  const dependencies = host.dependencies(SLUG)
  const write = dependencies.trackingStore.write
  dependencies.trackingStore.write = async (s, path, text) => (/deliver-review-\d+\.md$/.test(path) ? undefined : write(s, path, text))
  const outcome = await createRunPipeline(dependencies).run({ slug: SLUG, story: STORY })

  assert.equal(outcome.status, 'blocked')
  assert.equal(outcome.reason, `the review could not be read back at reviews/${TODAY}/deliver-review-1.md`)
  assert.equal(host.dispatches.filter((d) => d.agent === 'cold-reader-lens').length, 1)
})
