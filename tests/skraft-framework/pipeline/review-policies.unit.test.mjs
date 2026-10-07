// Unit — the pure rules of a review run as code (domain/pipeline/review/): which lenses run,
// what each reads, how a lens answer is read, and the severity matrix that decides.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  changedPaths,
  hasCodeReview,
  planLenses,
  recordedLensInputs,
  reviewInputPaths,
  reviewModeOf,
  storyOfEvidenceLog,
} from '../../../plugins/skraft-framework/src/domain/pipeline/review/review-lenses.mjs'
import { inconclusiveLens, lensDocumentOf, parseLensResult } from '../../../plugins/skraft-framework/src/domain/pipeline/review/lens-result.mjs'
import { codeReviewData, decideReview } from '../../../plugins/skraft-framework/src/domain/pipeline/review/review-verdict-policy.mjs'
import { composeLensBrief } from '../../../plugins/skraft-framework/src/domain/pipeline/review/lens-brief.mjs'
import { renderArtifact } from '../../../plugins/skraft-framework/src/application/render-artifact.mjs'
import { readReviewOutcome } from '../../../plugins/skraft-framework/src/domain/pipeline/review-outcome.mjs'
import { CONFIG, PLUGIN_ROOT, lensDocument } from './fake-host.mjs'

const names = (lenses) => lenses.map(({ name }) => name)
const result = (lens, verdict = 'pass', defects = []) => ({ lens, verdict, defects })
const defect = (severity, description = 'something is wrong') => ({ id: 'D1', gate: 'G7', severity, location: 'a.cs:1', description })

test('review mode: only "code" (any case, trimmed) runs the review in code; anything else keeps the agent', () => {
  assert.equal(reviewModeOf('code'), 'code')
  assert.equal(reviewModeOf(' CODE '), 'code')
  for (const value of ['agent', '', undefined, null, 'codes']) assert.equal(reviewModeOf(value), 'agent')
})

test('code review: DELIVER has one, the other phases keep their reviewer agent', () => {
  assert.equal(hasCodeReview('DELIVER'), true)
  for (const phase of ['RESEARCH', 'DESIGN', 'DISTILL', 'toString']) assert.equal(hasCodeReview(phase), false)
})

test('plan: DELIVER runs its four core lenses in table order; an unknown phase runs none', () => {
  assert.deepEqual(names(planLenses({ phase: 'DELIVER' })), ['quality-gates', 'architecture-boundaries', 'test-integrity', 'cold-reader'])
  assert.deepEqual(planLenses({ phase: 'DESIGN' }), [])
})

test('plan: mock-fidelity joins when a changed path or an added line names a mock', () => {
  assert.ok(names(planLenses({ phase: 'DELIVER', nameStatus: 'A\ttests/Checkout.IntegrationTest/PaymentGatewayStub.cs\n' })).includes('mock-fidelity'))
  assert.ok(names(planLenses({ phase: 'DELIVER', patch: '+++ b/x.cs\n+    var server = WireMockServer.Start();\n' })).includes('mock-fidelity'))
  assert.ok(!names(planLenses({ phase: 'DELIVER', patch: '-    var server = WireMockServer.Start();\n' })).includes('mock-fidelity'), 'a removed line is not added work')
  assert.ok(!names(planLenses({ phase: 'DELIVER', patch: '+++ b/WireMock.cs\n' })).includes('mock-fidelity'), 'the file header is not an added line')
})

test('plan: contract-fidelity joins on a contract file or a provider verification', () => {
  assert.ok(names(planLenses({ phase: 'DELIVER', nameStatus: 'A\tcontracts/payment.apiexamples\n' })).includes('contract-fidelity'))
  assert.ok(names(planLenses({ phase: 'DELIVER', nameStatus: 'R100\told.cs\tsrc/PaymentContractTests.cs\n' })).includes('contract-fidelity'), 'a rename target counts')
  assert.ok(names(planLenses({ phase: 'DELIVER', patch: '+        await verifier.VerifyAsync();\n' })).includes('contract-fidelity'))
  assert.deepEqual(names(planLenses({ phase: 'DELIVER', nameStatus: 'M\tsrc/Checkout/Payment.cs\n', patch: '+public sealed class Payment {}\n' })),
    ['quality-gates', 'architecture-boundaries', 'test-integrity', 'cold-reader'])
})

test('changed paths: every path of a name-status list, both sides of a rename', () => {
  assert.deepEqual(changedPaths('M\ta.cs\nR087\told.cs\tnew.cs\n\nD\tgone.cs'), ['a.cs', 'old.cs', 'new.cs', 'gone.cs'])
  assert.deepEqual(changedPaths(null), [])
})

test('every lens the plan can run is an agent the config knows', () => {
  const lenses = planLenses({ phase: 'DELIVER', nameStatus: 'A\tStub.cs\nA\tx.apiexamples\n' })
  assert.equal(lenses.length, 6)
  for (const { agent } of lenses) assert.equal(CONFIG.agentAliases[agent], agent, `${agent} is registered`)
})

test('review inputs: dated paths beside the review; the story key comes from the evidence log', () => {
  assert.deepEqual(reviewInputPaths({ date: '2026-10-08', story: 's1' }), {
    qgVerify: 'reviews/2026-10-08/qg-verify-s1.json',
    commits: 'reviews/2026-10-08/commits-s1.txt',
    patch: 'reviews/2026-10-08/diff-s1.patch',
    files: 'reviews/2026-10-08/files-s1.txt',
  })
  assert.equal(storyOfEvidenceLog('evidence/2026-10-08/s1/qg-s1.json'), 's1')
  assert.equal(storyOfEvidenceLog(null), 'story')
})

test('recorded inputs: the latest of each kind across phases, every feature file', () => {
  const inputs = recordedLensInputs({
    DESIGN: ['details/2026-10-01/contracts-s1.md', 'details/2026-10-03/contracts-s1.md'],
    DISTILL: ['features/a.feature', 'details/2026-10-02/test-plan-s1.md', 'features/b.feature', 'features/a.feature'],
    DELIVER: ['changes/2026-10-04/change-log.md', 'evidence/2026-10-04/s1/qg-s1.json'],
  })
  assert.equal(inputs.contracts, 'details/2026-10-03/contracts-s1.md')
  assert.equal(inputs.testPlan, 'details/2026-10-02/test-plan-s1.md')
  assert.equal(inputs.changeLog, 'changes/2026-10-04/change-log.md')
  assert.equal(inputs.evidenceLog, 'evidence/2026-10-04/s1/qg-s1.json')
  assert.deepEqual(inputs.feature, ['features/a.feature', 'features/b.feature'])
  assert.deepEqual(recordedLensInputs(undefined).feature, [])
})

test('lens answer: a fenced YAML document is read, its defects normalized', () => {
  const answer = `Here is my analysis.\n${lensDocument('test-integrity', { verdict: 'fail', defects: [{ severity: 'blocker', description: 'tautological: Assert.True(true)' }] })}\nDone.`
  const parsed = parseLensResult(answer, 'test-integrity')
  assert.equal(parsed.ok, true)
  assert.deepEqual(parsed.value, {
    lens: 'test-integrity',
    verdict: 'fail',
    defects: [{ id: 'D1', gate: 'G7', severity: 'blocker', location: 'tests/A.cs:1', description: 'tautological: Assert.True(true)' }],
  })
})

test('lens answer: an unfenced document is read whole; a missing id or gate gets a default', () => {
  const parsed = parseLensResult('lens: cold-reader\nverdict: fail\ndefects:\n  - severity: high\n    description: "unclear name"\n    suggestion: "rename"', 'cold-reader')
  assert.equal(parsed.ok, true)
  assert.deepEqual(parsed.value.defects, [{ id: 'D1', gate: 'meta', severity: 'high', location: '', description: 'unclear name', suggestion: 'rename' }])
  assert.equal(lensDocumentOf('```\nlens: x\n```'), 'lens: x')
})

test('lens answer: refused when empty, prose, another lens, or outside the enums', () => {
  const refused = (answer, lens = 'cold-reader') => parseLensResult(answer, lens).error
  assert.match(refused(''), /no YAML document/)
  assert.match(refused('I looked at it and it is fine.'), /lens is null/)
  assert.match(refused(lensDocument('test-integrity')), /lens is "test-integrity", expected "cold-reader"/)
  assert.match(refused('lens: cold-reader\nverdict: ok\ndefects: []'), /verdict "ok" is not one of pass, fail, inconclusive/)
  assert.match(refused('lens: cold-reader\nverdict: pass\ndefects: none'), /defects is not a list/)
  assert.match(refused('lens: cold-reader\nverdict: fail\ndefects:\n  - severity: warning\n    description: "x"'), /defect 1 has severity "warning"/)
})

test('a lens that stays unusable is recorded inconclusive with one medium meta defect naming why', () => {
  assert.deepEqual(inconclusiveLens('cold-reader', 'the lens returned no answer'), {
    lens: 'cold-reader',
    verdict: 'inconclusive',
    defects: [{ id: 'D1', gate: 'meta', severity: 'medium', location: 'review', description: 'lens output unusable after one retry: the lens returned no answer' }],
  })
})

test('verdict: every lens pass, or low defects only — APPROVED', () => {
  const clean = decideReview([result('quality-gates'), result('cold-reader')])
  assert.deepEqual(clean, { status: 'APPROVED', escalation: null, summary: 'APPROVED: 2 lenses pass.', dissent: 'no dissent' })
  const lows = decideReview([result('quality-gates'), result('cold-reader', 'pass', [defect('low')])])
  assert.equal(lows.status, 'APPROVED')
  assert.equal(lows.summary, 'APPROVED: 2 lenses pass, 1 low defect(s) left as notes.')
})

test('verdict: a blocker, a high, a medium or an inconclusive lens — NEEDS_REWORK, never escalated', () => {
  for (const severity of ['blocker', 'high', 'medium']) {
    const decision = decideReview([result('quality-gates'), result('test-integrity', 'fail', [defect(severity)])])
    assert.equal(decision.status, 'NEEDS_REWORK', severity)
    assert.equal(decision.escalation, null, severity)
  }
  assert.equal(decideReview([result('quality-gates', 'inconclusive', [defect('medium', 'evidence missing')])]).status, 'NEEDS_REWORK')
})

test('verdict: a failing lens with no blocking defect still blocks approval', () => {
  assert.equal(decideReview([result('quality-gates'), result('cold-reader', 'fail')]).status, 'NEEDS_REWORK')
  assert.equal(decideReview([result('cold-reader', 'fail', [defect('low')])]).status, 'NEEDS_REWORK')
})

test('verdict: no lens at all is no evidence — NEEDS_REWORK', () => {
  assert.deepEqual(decideReview([]), { status: 'NEEDS_REWORK', escalation: null, summary: 'NEEDS_REWORK: no lens ran.', dissent: 'no dissent' })
})

test('environment escalation: only inconclusive lenses whose every defect is a low environment one', () => {
  const environment = result('quality-gates', 'inconclusive', [defect('low', 'environment: dotnet SDK 10 missing; re-run dotnet test')])
  assert.equal(decideReview([environment, result('cold-reader')]).escalation, 'environment')
  assert.equal(decideReview([environment, result('cold-reader', 'pass', [defect('low', 'naming')])]).escalation, 'environment', 'a low note elsewhere is no reason to rework')
  assert.equal(decideReview([environment, result('test-integrity', 'fail', [defect('high')])]).escalation, null, 'a code defect is the engineer’s')
  assert.equal(decideReview([environment, result('cold-reader', 'fail')]).escalation, null, 'a failing lens is the engineer’s')
  assert.equal(decideReview([result('quality-gates', 'inconclusive', [defect('low', 'snapshot missing')])]).escalation, null, 'not an environment cause')
  assert.equal(decideReview([result('quality-gates', 'inconclusive')]).escalation, null, 'an inconclusive lens with no defect names no cause')
  assert.match(decideReview([environment]).summary, /^NEEDS_REWORK \(environment\): quality-gates inconclusive \(1 low\)\.$/)
})

test('dissent: a minority that does not pass is upheld and named, with the lenses that passed', () => {
  const { dissent, summary } = decideReview([
    result('quality-gates'), result('architecture-boundaries'), result('cold-reader'),
    result('test-integrity', 'fail', [defect('blocker'), defect('high'), defect('high')]),
  ])
  assert.equal(dissent, 'Minority upheld: test-integrity fail (1 blocker, 2 high). quality-gates, architecture-boundaries, cold-reader passed; the severity matrix keeps every blocker, high and medium defect and every inconclusive lens, whatever the majority.')
  assert.equal(summary, 'NEEDS_REWORK: test-integrity fail (1 blocker, 2 high).')
})

test('review data: rendered with the review-verdict template, read back by the phase gate', () => {
  const lensResults = [result('quality-gates', 'inconclusive', [defect('low', 'environment: no network')])]
  const data = codeReviewData({ lensResults, decision: decideReview(lensResults), reviewedSha: 'abc1234' })
  assert.deepEqual(Object.keys(data), ['status', 'lens_results', 'dissent_analysis', 'summary', 'reviewed_sha', 'escalation'])
  const text = renderArtifact('review-verdict', data, { readTemplate: (path) => readFileSync(join(PLUGIN_ROOT, path), 'utf8') })
  const outcome = readReviewOutcome(text)
  assert.equal(outcome.verdict, 'NEEDS_REWORK')
  assert.equal(outcome.escalation, 'environment')
  assert.match(text, /environment: no network/)
  const approved = codeReviewData({ lensResults: [result('cold-reader')], decision: decideReview([result('cold-reader')]), reviewedSha: null })
  assert.deepEqual(Object.keys(approved), ['status', 'lens_results', 'dissent_analysis', 'summary'])
})

test('lens brief: the inputs and nothing else, absent ones said so, the answer it must give', () => {
  const [, , , coldReader] = planLenses({ phase: 'DELIVER' })
  const brief = composeLensBrief({
    lens: coldReader,
    phase: 'DELIVER',
    slug: 'checkout',
    story: { issue: 42, title: 'Pay by card' },
    inputs: [{ kind: 'patch', path: '.t/reviews/d/diff-s1.patch' }, { kind: 'files', path: null }],
  })
  assert.match(brief, /^## Skraft review lens — cold-reader \(DELIVER\)$/m)
  assert.match(brief, /- Story: #42 — Pay by card/)
  assert.match(brief, /Patch since the DELIVER base .*: `\.t\/reviews\/d\/diff-s1\.patch`/)
  assert.match(brief, /Changed-file list \(git diff --name-status\): absent — none was recorded/)
  assert.match(brief, /keys: lens, verdict, defects\. Quote every free-text value\./)
  assert.match(brief, /`lens` is exactly `cold-reader`/)
  assert.doesNotMatch(brief, /Previous answer refused/)
  assert.match(composeLensBrief({ lens: coldReader, phase: 'DELIVER', slug: 'checkout', story: null, inputs: [], retry: 'verdict "ok" is not one of pass, fail, inconclusive' }),
    /- Story: none[\s\S]*## Previous answer refused\nverdict "ok" is not one of pass, fail, inconclusive\. Answer again/)
})

test('lens brief: a story by issue or by title alone; an input kind with no label is shown by its name', () => {
  const [lens] = planLenses({ phase: 'DELIVER' })
  const brief = (story, inputs = []) => composeLensBrief({ lens, phase: 'DELIVER', slug: 'checkout', story, inputs })
  assert.match(brief({ issue: 7 }), /- Story: #7$/m)
  assert.match(brief({ title: 'Pay by card' }), /- Story: Pay by card$/m)
  assert.match(brief({}), /- Story: none$/m)
  assert.match(brief(null, [{ kind: 'screenshots', path: 'a.png' }]), /- screenshots: `a\.png`/)
})
