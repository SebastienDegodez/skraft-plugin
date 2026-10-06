import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  stepOnEntry,
  stepAfterReview,
  stepAfterMissingOutputs,
  stepAfterQualityGates,
  stepAfterEnvironmentFixed,
  stepAfterRejection,
  reworkStep,
  checkpointKeys,
  ADVANCE,
  REVIEWER,
} from '../../../plugins/skraft-framework/src/domain/pipeline/step-policy.mjs'
import {
  expectedTrackedOutputs,
  matchOutputs,
  latestEvidenceLog,
  structuralScanPath,
  hasStructuralScan,
} from '../../../plugins/skraft-framework/src/domain/pipeline/expected-outputs.mjs'
import { CONFIG, concretePath } from './fake-host.mjs'

// ── step-policy ───────────────────────────────────────────────────────────────

test('step-policy: a phase starts with its specialist, or advances when already approved', () => {
  assert.deepEqual(stepOnEntry({ verdict: undefined }), { kind: 'specialist', addenda: [] })
  assert.equal(stepOnEntry({ verdict: 'APPROVED' }), ADVANCE)
})

test('step-policy: a phase resumed after changes requested follows its latest review', () => {
  const base = { verdict: 'CHANGES_REQUESTED', attempt: 2, maxAttempts: 3 }
  assert.deepEqual(stepOnEntry({ ...base, lastReview: { verdict: 'REJECTED', findings: 'G13' } }), { kind: 'rejected', findings: 'G13' })
  assert.deepEqual(stepOnEntry({ ...base, lastReview: { verdict: 'NEEDS_REWORK', escalation: 'environment', findings: 'no SDK' } }), { kind: 'environment', detail: 'no SDK', source: 'review' })
  const rework = stepOnEntry({ ...base, lastReview: { verdict: 'NEEDS_REWORK', escalation: null, findings: 'G4 missing' } })
  assert.equal(rework.kind, 'specialist')
  assert.equal(rework.addenda[0].title, 'Reviewer findings (attempt 2 of 3)')
  assert.match(rework.addenda[0].body, /G4 missing/)
  assert.deepEqual(stepOnEntry({ ...base, lastReview: null }), { kind: 'specialist', addenda: [] })
})

test('step-policy: a review verdict decides the state verdict and the next step', () => {
  assert.deepEqual(stepAfterReview({ verdict: 'APPROVED' }), { stateVerdict: 'APPROVED', step: ADVANCE })
  assert.deepEqual(stepAfterReview({ verdict: 'NEEDS_REWORK', escalation: null, findings: 'f' }), { stateVerdict: 'CHANGES_REQUESTED', step: { kind: 'retry', findings: 'f' } })
  assert.deepEqual(stepAfterReview({ verdict: 'NEEDS_REWORK', escalation: 'environment', findings: 'f' }).step, { kind: 'environment', detail: 'f', source: 'review' })
  assert.deepEqual(stepAfterReview({ verdict: 'REJECTED', findings: 'f' }), { stateVerdict: 'CHANGES_REQUESTED', step: { kind: 'rejected', findings: 'f' } })
  assert.deepEqual(stepAfterReview({ verdict: null }), { stateVerdict: null, step: null })
})

test('step-policy: quality gates — pass goes on, fail is a retry, anything else asks about the environment', () => {
  assert.equal(stepAfterQualityGates({ outcome: 'pass', findings: '' }), null)
  assert.equal(stepAfterQualityGates({ outcome: 'fail', findings: 'G6' }).kind, 'retry')
  assert.deepEqual(stepAfterQualityGates({ outcome: 'inconclusive', findings: 'G1' }), { kind: 'environment', detail: 'G1', source: 'qg-verify' })
  assert.equal(stepAfterQualityGates({ outcome: 'error', findings: 'x' }).kind, 'environment')
})

test('step-policy: missing outputs, environment fixed, rejection answer, rework', () => {
  assert.deepEqual(stepAfterMissingOutputs(['a.md', 'b.md']), { kind: 'retry', findings: 'Artefact missing: a.md, b.md. Write every required output at its dated path.' })
  assert.equal(stepAfterEnvironmentFixed('DESIGN'), REVIEWER)
  assert.equal(stepAfterEnvironmentFixed('DELIVER').addenda[0].title, 'Environment re-gate')
  assert.deepEqual(stepAfterRejection(' Rework ', 'f'), { kind: 'retry', findings: 'f' })
  assert.equal(stepAfterRejection('stop', 'f'), null)
  assert.deepEqual(reworkStep({ findings: '', attempt: 2, maxAttempts: 3 }), { kind: 'specialist', addenda: [] })
})

test('step-policy: checkpoint keys are stable and distinct per occurrence', () => {
  assert.equal(checkpointKeys.rejected('DESIGN', 2), 'rejected:DESIGN:2')
  assert.equal(checkpointKeys.adrRatification([{ adr: '007' }, { adr: '008' }]), 'adr-ratification:007,008')
  const env = (occurrence) => checkpointKeys.environment('DELIVER', { source: 'qg-verify', recordedReviews: 0, retries: 1, occurrence })
  assert.equal(env(1), 'environment:DELIVER:qg-verify:r0:t1:n1')
  assert.notEqual(env(1), env(2))
})

// ── expected-outputs ──────────────────────────────────────────────────────────

test('expected-outputs: required and optional tracked outputs of an agent, repository outputs left out', () => {
  const architect = expectedTrackedOutputs('Skraft - Solution Architect', CONFIG)
  assert.ok(architect.some((o) => o.pattern === 'details/{date}/contracts-{story}.md' && !o.optional))
  assert.ok(architect.some((o) => o.optional))
  assert.ok(architect.every((o) => !o.pattern.startsWith('docs/')))
  assert.deepEqual(expectedTrackedOutputs('Nobody', CONFIG), [])
})

test('expected-outputs: found files and missing required patterns', () => {
  const expectations = [
    { pattern: 'research/{date}/{slug}-research.md', optional: false },
    { pattern: 'details/{date}/notes.md', optional: true },
    { pattern: 'details/{date}/contracts-{story}.md', optional: false },
  ]
  const files = ['research/2026-10-06/checkout-research.md', 'unrelated.txt']
  assert.deepEqual(matchOutputs(files, expectations), {
    found: ['research/2026-10-06/checkout-research.md'],
    missing: ['details/{date}/contracts-{story}.md'],
  })
})

test('expected-outputs: latest evidence log, structural scan path and presence', () => {
  assert.equal(latestEvidenceLog(['changes/d/change-log.md', 'evidence/2026-10-05/s1/qg-s1.json', 'evidence/2026-10-06/s1/qg-s1.json']), 'evidence/2026-10-06/s1/qg-s1.json')
  assert.equal(latestEvidenceLog(['changes/d/change-log.md']), null)
  assert.equal(structuralScanPath('2026-10-06'), 'details/2026-10-06/structural-scan.json')
  assert.equal(hasStructuralScan({ phaseArtifacts: { RESEARCH: ['details/d/structural-scan.json'] } }), true)
  assert.equal(hasStructuralScan({ phaseArtifacts: {} }), false)
})

// ── Recovery, progress inference, manual closure ───────────────────────────────

test('recoveryStepOf: the step each diagnosis calls for', async () => {
  const { recoveryStepOf, buildRecoveryGuidance } = await import('../../../plugins/skraft-framework/src/domain/recovery-policy.mjs')
  assert.equal(recoveryStepOf({ code: 'HEALTHY' }), 'none')
  assert.equal(recoveryStepOf({ code: 'MISSING_STATE' }), 'init')
  assert.equal(recoveryStepOf({ code: 'MISSING_STATE', backupCount: 1 }), 'rollback')
  assert.equal(recoveryStepOf({ code: 'CORRUPTED_STATE' }), 'reset')
  assert.equal(recoveryStepOf({ code: 'INVALID_STATE', backupCount: 2 }), 'rollback')
  assert.equal(recoveryStepOf({ code: 'STALE' }), 'resolve-stale')
  assert.equal(recoveryStepOf({ code: 'IO_ERROR' }), 'halt')
  assert.equal(buildRecoveryGuidance({ code: 'CORRUPTED_STATE', slug: 's', backupCount: 1 }).step, 'rollback')
})

test('reviewFilesOf: a phase\'s reviews, newest date then highest number first', async () => {
  const { reviewFilesOf } = await import('../../../plugins/skraft-framework/src/domain/pipeline/progress-inference-policy.mjs')
  const files = [
    'reviews/2026-10-01/design-review-2.md', 'reviews/2026-10-02/design-review-1.md',
    'reviews/2026-10-01/design-review-10.md', 'reviews/2026-10-02/distill-review-1.md', 'reviews/2026-10-02/manual-close.md',
  ]
  assert.deepEqual(reviewFilesOf('DESIGN', files), [
    'reviews/2026-10-02/design-review-1.md', 'reviews/2026-10-01/design-review-10.md', 'reviews/2026-10-01/design-review-2.md',
  ])
})

test('inferCompletedPhases: phases in order while outputs and, when reviewed, an APPROVED review are there', async () => {
  const { inferCompletedPhases } = await import('../../../plugins/skraft-framework/src/domain/pipeline/progress-inference-policy.mjs')
  const { requiredTrackedOutputs } = await import('../../../plugins/skraft-framework/src/domain/phase-gate-policy.mjs')
  const outputs = (phase) => requiredTrackedOutputs(CONFIG.phaseAgents[phase].specialist, CONFIG).map((p) => concretePath(p, 'checkout'))
  const phaseOrder = ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER', 'DONE']
  const files = [...outputs('RESEARCH'), ...outputs('DESIGN'), ...outputs('DISTILL')]
  const approved = { DESIGN: 'reviews/d/design-review-1.md' }
  const completed = inferCompletedPhases({ phaseOrder, config: CONFIG, files, approvedReview: (phase) => approved[phase] ?? null })

  assert.deepEqual(completed.map(({ phase, review }) => [phase, review]), [['RESEARCH', null], ['DESIGN', 'reviews/d/design-review-1.md']])
  assert.deepEqual(inferCompletedPhases({ phaseOrder, config: CONFIG, files: [], approvedReview: () => 'x' }), [])
})

test('manual closure: the review it renders, its path, and what it refuses', async () => {
  const { manualClosureReview, manualClosePath, manualClosureRefusal } = await import('../../../plugins/skraft-framework/src/domain/pipeline/manual-closure-policy.mjs')
  const { validate } = await import('../../../plugins/skraft-framework/src/domain/artifact-registry.mjs')
  assert.equal(validate('review-verdict', manualClosureReview()).ok, true)
  const weights = Object.values(manualClosureReview().synthesis.questions).reduce((sum, q) => sum + q.weight, 0)
  assert.equal(Math.round(weights * 100), 100)
  assert.equal(manualClosePath('2026-10-06'), 'reviews/2026-10-06/manual-close.md')
  assert.equal(manualClosureRefusal({ currentPhase: 'DESIGN', reviewer: 'R' }), null)
  assert.equal(manualClosureRefusal({ phase: 'DESIGN', currentPhase: 'DESIGN', reviewer: 'R' }), null)
  assert.equal(manualClosureRefusal({ currentPhase: 'DONE' }).code, 'PIPELINE_DONE')
  assert.equal(manualClosureRefusal({ currentPhase: 'RESEARCH' }).code, 'NO_REVIEWER')
  assert.equal(manualClosureRefusal({ phase: 'DISTILL', currentPhase: 'DESIGN', reviewer: 'R' }).code, 'PHASE_MISMATCH')
})

// ── Reporting ────────────────────────────────────────────────────────────────

test('remoteScopeOf: github, gitlab and Azure DevOps remotes, https or ssh; anything else is unknown', async () => {
  const { remoteScopeOf } = await import('../../../plugins/skraft-framework/src/domain/reporting-consent-policy.mjs')
  assert.deepEqual(remoteScopeOf('git@github.com:acme/shop.git'), { provider: 'github', host: 'github.com', repo: 'acme/shop' })
  assert.deepEqual(remoteScopeOf('https://token@github.com/acme/shop'), { provider: 'github', host: 'github.com', repo: 'acme/shop' })
  assert.deepEqual(remoteScopeOf('https://gitlab.com/group/sub/shop.git'), { provider: 'gitlab', host: 'gitlab.com', repo: 'group/sub/shop' })
  assert.deepEqual(remoteScopeOf('https://dev.azure.com/org/proj/_git/shop'), { provider: 'azure-devops', host: 'dev.azure.com', organization: 'org', project: 'proj', repo: 'shop' })
  assert.deepEqual(remoteScopeOf('git@ssh.dev.azure.com:v3/org/proj/shop'), { provider: 'azure-devops', host: 'dev.azure.com', organization: 'org', project: 'proj', repo: 'shop' })
  assert.equal(remoteScopeOf('https://example.com/acme/shop.git'), null)
  assert.equal(remoteScopeOf('https://github.com/acme'), null)
  assert.equal(remoteScopeOf(null), null)
})

test('interpretConsent: destinations, numbers, media and draft; refusals never fall back to defaults', async () => {
  const { interpretConsent } = await import('../../../plugins/skraft-framework/src/domain/reporting-consent-policy.mjs')
  const scope = { provider: 'github', host: 'github.com', repo: 'acme/shop' }
  const context = { scope, branch: 'feature/x', issueNumber: 42 }
  const prefs = (answer, ctx = context) => interpretConsent(answer, ctx)
  assert.deepEqual(prefs('PR + Issue, chat pr=#7 media=3 draft').preferences, {
    confirmed: true, ...scope, branch: 'feature/x', prNumber: 7, issueNumber: 42,
    destinations: { pr: true, issue: 'link', chat: true }, maxMedia: 3, allowDraftPr: true,
  })
  assert.deepEqual(prefs('issue').preferences.destinations, { pr: false, issue: 'full', chat: false })
  assert.equal(prefs('issue=#9').preferences.issueNumber, 9)
  assert.deepEqual(prefs('local').preferences.destinations, { pr: false, issue: 'none', chat: false })
  assert.equal(prefs('chat').preferences.repo, null)
  for (const [answer, reason] of [
    ['', /no destination/], ['everywhere', /not a destination/], ['pr=abc', /not understood/],
    ['local+chat', /excludes/], ['pr=#0', /positive/], ['issue', /requires an issue number/],
  ]) {
    assert.match(prefs(answer, answer === 'issue' ? { ...context, issueNumber: null } : context).reason, reason, answer)
  }
  assert.match(prefs('pr', { ...context, scope: null }).reason, /recognised origin/)
})

test('report boundaries: dated data and notes, the newest first; the addendum only for DISTILL and DELIVER', async () => {
  const policy = await import('../../../plugins/skraft-framework/src/domain/report-boundary-policy.mjs')
  const files = ['reporting/2026-10-01/forecast-data.json', 'reporting/2026-10-03/forecast-data.json', 'reporting/2026-10-02/outcome-data.json', 'reporting/x/forecast-data.json']
  assert.equal(policy.latestReportData('forecast', files), 'reporting/2026-10-03/forecast-data.json')
  assert.equal(policy.latestReportData('outcome', files), 'reporting/2026-10-02/outcome-data.json')
  assert.equal(policy.latestHandoffNotes(files), null)
  assert.equal(policy.reportingAddendum({ phase: 'DESIGN' }), null)
  assert.equal(policy.isRepositoryRef('../etc/passwd'), false)
  assert.equal(policy.isRepositoryRef('.copilot-tracking/a.md'), true)
  assert.deepEqual(policy.boundReportData({ maxMedia: 4 }, {}), { maxMedia: 4 })
  assert.deepEqual(policy.boundReportData({}, { reviewRef: 'r.md', maxMedia: 1 }), { reviewRef: 'r.md', maxMedia: 1 })
  assert.equal(
    policy.chatSummary({ kind: 'forecast', story: 's', markdownPath: 'p.md', results: [{ destination: 'pr', status: 'published', url: 'https://u' }, { destination: 'issue', status: 'pending', reason: 'r' }] }),
    'forecast report for s: p.md\n  pr: published https://u\n  issue: pending — r',
  )
})

// ── Run journal and pipeline view ─────────────────────────────────────────────

test('run journal: started keeps the previous log, bounded; awaiting, answered and finished move the status', async () => {
  const j = await import('../../../plugins/skraft-framework/src/domain/pipeline/run-journal-policy.mjs')
  const old = { log: Array.from({ length: j.MAX_JOURNAL_LINES }, (_, i) => ({ at: 't', message: `old ${i}` })), story: { issue: 1 } }
  let journal = j.journalStarted(old, { at: 't1' })
  assert.equal(journal.log.length, j.MAX_JOURNAL_LINES)
  assert.equal(journal.log.at(-1).message, 'run started')
  assert.deepEqual(journal.story, { issue: 1 })
  journal = j.journalAwaiting(j.journalPhase(journal, 'DESIGN', 't2'), { key: 'k', question: 'Q?', options: ['a'] }, 't3')
  assert.deepEqual([journal.status, journal.phase, journal.checkpoint], ['awaiting-human', 'DESIGN', { key: 'k', question: 'Q?', options: ['a'] }])
  journal = j.journalAnswered(journal, 'k', 't4')
  assert.deepEqual([journal.status, journal.checkpoint], ['running', null])
  journal = j.journalFinished(journal, { status: 'blocked', phase: 'DESIGN', reason: 'budget' }, 't5')
  assert.deepEqual([journal.status, journal.reason, journal.updatedAt, journal.log.at(-1).message], ['blocked', 'budget', 't5', 'blocked — budget'])
})

test('pipeline view: the open phase takes the run status; durations run to now while open', async () => {
  const { buildPipelineView, isViewableTrackedFile } = await import('../../../plugins/skraft-framework/src/domain/pipeline/pipeline-view-policy.mjs')
  const state = {
    currentPhase: 'DISTILL', retryCount: { DISTILL: 5 }, userPreferences: { maxRetriesPerPhase: 2 },
    phaseHistory: { DISTILL: { startedAt: '2026-10-06T10:00:00.000Z' }, DESIGN: { startedAt: '2026-10-06T09:00:00.000Z', completedAt: '2026-10-06T09:30:00.000Z' } },
  }
  const view = (run) => buildPipelineView({ slug: 's', config: CONFIG, state, run, now: '2026-10-06T10:05:00.000Z' })
  for (const [status, expected] of [['running', 'active'], ['blocked', 'blocked'], ['error', 'blocked'], ['done', 'open']]) {
    assert.equal(view({ status, phase: 'DISTILL', log: [] }).phases[2].status, expected, status)
  }
  assert.equal(view(null).phases[2].status, 'open')
  assert.equal(view({ status: 'running', phase: 'DESIGN', log: [] }).phases[2].status, 'active', 'a run elsewhere still runs')
  const v = view(null)
  assert.equal(v.phases[2].durationMs, 5 * 60 * 1000)
  assert.equal(v.phases[1].durationMs, 30 * 60 * 1000)
  assert.equal(v.phases[2].attempt, 3, 'capped at the attempts the budget allows')
  assert.equal(v.phases[3].durationMs, null)
  assert.equal(isViewableTrackedFile('reviews/a.md', ['reviews/a.md']), true)
  assert.equal(isViewableTrackedFile('state.json', ['state.json']), false)
  assert.equal(isViewableTrackedFile('evidence/x.txt', ['evidence/x.txt']), false)
})

// ── Steps, tests, cost ─────────────────────────────────────────────────────────

test('cost: credits and dollars per dispatch, phase and pipeline; euros only with a rate', async () => {
  const { pipelineCost, usdOf } = await import('../../../plugins/skraft-framework/src/domain/pipeline/cost-policy.mjs')
  assert.equal(usdOf({ credits: 250 }), 2.5)
  assert.equal(usdOf({ usd: 0.4, credits: 999 }), 0.4, 'dollars reported win')
  assert.equal(usdOf({}), null)
  const dispatches = [
    { phase: 'DESIGN', role: 'specialist', agent: 'A', durationMs: 1000, ok: true, usage: { credits: 100, inputTokens: 10, outputTokens: 5, requests: 2 } },
    { phase: 'DESIGN', role: 'reviewer', agent: 'R', durationMs: 500, ok: true, usage: { usd: 0.5, inputTokens: 1, outputTokens: 1 } },
    { phase: 'DELIVER', role: 'specialist', agent: 'E', durationMs: 200, ok: false },
    { phase: 'REPORT', role: 'transport', agent: null, durationMs: 100, ok: true, usage: { credits: 10 } },
  ]
  const cost = pipelineCost({ dispatches, phases: ['DESIGN', 'DELIVER'], eurPerUsd: 0.9 })
  assert.deepEqual(cost.total, { dispatches: 4, reported: 3, credits: 110, usd: 1.6, eur: 1.44, inputTokens: 11, outputTokens: 6, cacheReadTokens: 0, requests: 2, durationMs: 1800 })
  assert.deepEqual(cost.byPhase.map((p) => [p.phase, p.credits, p.usd, p.dispatches]), [['DESIGN', 100, 1.5, 2], ['DELIVER', null, null, 1], ['REPORT', 10, 0.1, 1]])
  assert.deepEqual(cost.dispatches[1], { at: undefined, phase: 'DESIGN', role: 'reviewer', agent: 'R', durationMs: 500, ok: true, model: null, tokens: 2, credits: null, usd: 0.5, eur: 0.45 })
  assert.equal(pipelineCost({ dispatches, eurPerUsd: null }).total.eur, null)
  assert.equal(pipelineCost({ dispatches, eurPerUsd: 0 }).eurPerUsd, null)
})

test('test results: gates and test counts from the evidence log, the verdict from the code that checked it', async () => {
  const { testResults } = await import('../../../plugins/skraft-framework/src/domain/pipeline/test-results-policy.mjs')
  const evidence = {
    $schema: 'quality-gates-evidence/v4', produced_at: 't0', repo_root_rev: 'abc',
    gates: [
      { id: 'G1', label: 'Acceptance', status: 'pass', metrics: { tests_total: 3, tests_passed: 3, tests_failed: 0 } },
      { id: 'G2', label: 'Unit', status: 'fail', metrics: { tests_total: 10, tests_passed: 8, tests_failed: 2 } },
      { id: 'G6', scope: 'core', label: 'Mutation', status: 'pass' },
      { id: 'G11', label: 'Coverage', status: 'not_applicable', rationale: 'no code' },
      null,
    ],
    test_integrity: { cycles: [{}, {}] },
  }
  const verification = { evidenceLog: 'evidence/d/s/qg-s.json', verdict: 'fail', at: 't1', findings: [{ severity: 'fail', code: 'GATE_FAILED', detail: 'G2 records status fail', gate: 'G2' }] }
  const results = testResults({ evidenceLog: 'evidence/d/s/qg-s.json', evidence, verification })
  assert.deepEqual(results.tests, { total: 13, passed: 11, failed: 2 })
  assert.deepEqual(results.gates.map((g) => [g.id, g.status, g.rationale]), [['G1', 'pass', null], ['G2', 'fail', null], ['G6/core', 'pass', null], ['G11', 'not_applicable', 'no code']])
  assert.deepEqual([results.verdict, results.verifiedAt, results.cycles, results.producedAt], ['fail', 't1', 2, 't0'])
  assert.deepEqual(results.findings, [{ severity: 'fail', code: 'GATE_FAILED', detail: 'G2 records status fail', gate: 'G2' }])
  assert.equal(testResults({ evidenceLog: 'evidence/other/qg-x.json', evidence, verification }).verdict, null, 'a check of another log is not this one')
  assert.deepEqual(testResults({}), { evidenceLog: null, producedAt: null, revision: null, schema: null, gates: [], tests: null, cycles: null, verdict: null, verifiedAt: null, findings: [] })
})

test('phase steps: a check mark per step, failed, waiting, running or skipped where it applies', async () => {
  const { phaseSteps } = await import('../../../plugins/skraft-framework/src/domain/pipeline/phase-steps-policy.mjs')
  const phase = (name, status, extra = {}) => ({ name, status, specialist: 'S', reviewer: 'R', artifacts: ['a.md'], reviews: [], ...extra })
  const ctx = { structuralScan: true, adrRatification: null, qualityGates: null, reports: [] }
  const ids = (steps) => steps.map((s) => `${s.id}:${s.status}`)

  assert.deepEqual(ids(phaseSteps(phase('DESIGN', 'awaiting', { reviews: [{ verdict: 'REJECTED' }] }), { ...ctx, adrRatification: { checkpointStatus: 'awaiting_human' } })),
    ['structural-scan:done', 'outputs:done', 'review:failed', 'adr-ratification:waiting', 'closed:waiting'])
  assert.deepEqual(ids(phaseSteps(phase('DELIVER', 'active', { reviews: [{ verdict: 'NEEDS_REWORK' }] }), { ...ctx, qualityGates: { verdict: 'inconclusive' } })),
    ['outputs:done', 'quality-gates:failed', 'review:running', 'outcome-report:pending', 'closed:pending'])
  assert.deepEqual(ids(phaseSteps(phase('DISTILL', 'done', { reviews: [{ verdict: 'APPROVED' }] }), ctx)),
    ['outputs:done', 'review:done', 'forecast-report:skipped', 'closed:done'])
  assert.deepEqual(ids(phaseSteps(phase('DISTILL', 'done', { reviews: [{ verdict: 'APPROVED' }] }), { ...ctx, reports: [{ kind: 'forecast' }] }))[2], 'forecast-report:done')
  assert.deepEqual(ids(phaseSteps(phase('RESEARCH', 'active', { reviewer: null, artifacts: [] }), ctx)), ['outputs:running', 'closed:pending'])
  assert.deepEqual(ids(phaseSteps(phase('DELIVER', 'blocked', { artifacts: [] }), ctx)), ['outputs:pending', 'quality-gates:pending', 'review:pending', 'outcome-report:pending', 'closed:failed'])
  assert.deepEqual(ids(phaseSteps(phase('DESIGN', 'pending', { artifacts: [] }), { ...ctx, structuralScan: false })),
    ['structural-scan:pending', 'outputs:pending', 'review:pending', 'adr-ratification:pending', 'closed:pending'])
})

test('active pipeline: the working copy acts on the slug .active-slug names, never another, never a guess', async () => {
  const { resolveActivePipeline, NO_ACTIVE_PIPELINE, NOT_THE_ACTIVE_PIPELINE } = await import('../../../plugins/skraft-framework/src/domain/pipeline/active-pipeline-policy.mjs')
  assert.deepEqual(resolveActivePipeline({ active: 'checkout' }), { ok: true, value: 'checkout' })
  assert.deepEqual(resolveActivePipeline({ requested: 'checkout', active: 'checkout' }), { ok: true, value: 'checkout' })
  assert.equal(resolveActivePipeline({ requested: 'refund', active: 'checkout' }).error.code, NOT_THE_ACTIVE_PIPELINE)
  assert.equal(resolveActivePipeline({ requested: 'checkout', active: null }).error.code, NO_ACTIVE_PIPELINE, 'naming a slug does not replace the pointer')
  assert.equal(resolveActivePipeline({}).error.code, NO_ACTIVE_PIPELINE)
})
