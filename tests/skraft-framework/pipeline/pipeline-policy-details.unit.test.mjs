// Unit tests of the small pure pipeline policies (domain/pipeline/*): exact outputs,
// defaults and boundaries of the ADR ratification, the dispatch brief, the run journal,
// the cost, the manual closure, the review outcome, the expected outputs, the progress
// inference, the test results, the step policy and the pipeline definition.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  proposedAdrs, ratificationQuestion, RATIFICATION_OPTIONS, interpretRatification,
} from '../../../plugins/skraft-framework/src/domain/pipeline/adr-ratification-policy.mjs'
import {
  composeDispatchBrief, reworkAddendum, ENVIRONMENT_REGATE_ADDENDUM, reviewOutputPath,
} from '../../../plugins/skraft-framework/src/domain/pipeline/dispatch-brief.mjs'
import { renderHandoff, HANDOFF_MODES } from '../../../plugins/skraft-framework/src/domain/handoff-policy.mjs'
import {
  journalStarted, journalDispatch, journalVerification, journalAwaiting, journalAnswered, journalFinished,
  MAX_JOURNAL_DISPATCHES,
} from '../../../plugins/skraft-framework/src/domain/pipeline/run-journal-policy.mjs'
import { pipelineCost } from '../../../plugins/skraft-framework/src/domain/pipeline/cost-policy.mjs'
import { manualClosureReview, manualClosureRefusal } from '../../../plugins/skraft-framework/src/domain/pipeline/manual-closure-policy.mjs'
import { readReviewOutcome } from '../../../plugins/skraft-framework/src/domain/pipeline/review-outcome.mjs'
import {
  expectedTrackedOutputs, matchOutputs, latestEvidenceLog, hasStructuralScan,
} from '../../../plugins/skraft-framework/src/domain/pipeline/expected-outputs.mjs'
import { reviewFilesOf, inferCompletedPhases } from '../../../plugins/skraft-framework/src/domain/pipeline/progress-inference-policy.mjs'
import { testResults } from '../../../plugins/skraft-framework/src/domain/pipeline/test-results-policy.mjs'
import { stepOnEntry, specialist } from '../../../plugins/skraft-framework/src/domain/pipeline/step-policy.mjs'
import { isPipelineDispatcher, PIPELINE_DISPATCHER } from '../../../plugins/skraft-framework/src/domain/pipeline/pipeline-definition.mjs'

// ── ADR ratification ─────────────────────────────────────────────────────────

test('adr: proposed rows only, read from the pipe table after any heading, padding trimmed', () => {
  const index = [
    '# Decisions index',
    '',
    '| ADR | Title | Status |',
    '|---|---|---|',
    '| 001 | Use events | Proposed |',
    '| 002 | Use SQL | Accepted |',
    '  | 003 | Cache reads | proposed | extra',
    '| 004 | No trailing pipe | Proposed',
    'a note that ends with a pipe |',
  ].join('\r\n')
  assert.deepEqual(proposedAdrs(index), [{ adr: '001', title: 'Use events' }, { adr: '003', title: 'Cache reads' }])
})

test('adr: a table without an ADR or a Status column yields nothing; columns may come in any order', () => {
  assert.deepEqual(proposedAdrs('| Title | Status |\n|---|---|\n| X | Proposed |\n'), [])
  assert.deepEqual(proposedAdrs('| ADR | Title |\n|---|---|\n| 001 | X |\n'), [])
  assert.deepEqual(proposedAdrs('| Status | ADR | Title |\n|---|---|---|\n| Proposed | 007 | First |\n'), [{ adr: '007', title: 'First' }])
  assert.deepEqual(proposedAdrs('| Title | ADR | Status |\n|---|---|---|\n| Named | 008 | Proposed |\n'), [{ adr: '008', title: 'Named' }])
  assert.deepEqual(proposedAdrs('| ADR | Status |\n|---|---|\n| 009 | Proposed |\n| 010 |\n'), [{ adr: '009', title: '' }])
  assert.deepEqual(proposedAdrs('| ADR | Title | Status |\n|---|---|---|\n'), [])
  assert.deepEqual(proposedAdrs(null), [])
})

test('adr: the ratification question lists each pending ADR and the answers', () => {
  assert.equal(ratificationQuestion([{ adr: '001', title: 'Use events' }, { adr: '002', title: 'Use SQL' }]), [
    'DESIGN is approved. 2 ADR(s) await your ratification:',
    '- ADR-001 Use events',
    '- ADR-002 Use SQL',
    'Answer "accept all", "reject all", "pause", or per ADR: `<NNN> accept | reject | amend "<note>"`.',
  ].join('\n'))
  assert.deepEqual([...RATIFICATION_OPTIONS], ['accept all', 'reject all', 'pause'])
})

test('adr: accept all / reject all, padded and in any case', () => {
  const pending = [{ adr: '001', title: 'A' }, { adr: '002', title: 'B' }]
  assert.deepEqual(interpretRatification('  Accept All  ', pending), {
    kind: 'ratify', verdicts: [{ adr: '001', verdict: 'Accepted' }, { adr: '002', verdict: 'Accepted' }], amendments: [],
  })
  assert.deepEqual(interpretRatification('reject all', pending), {
    kind: 'ratify', verdicts: [{ adr: '001', verdict: 'Rejected' }, { adr: '002', verdict: 'Rejected' }], amendments: [],
  })
  assert.deepEqual(interpretRatification(null, pending), { kind: 'pause' })
  assert.deepEqual(interpretRatification(' pause ', pending), { kind: 'pause' })
})

test('adr: per-ADR answers — accept, reject, amend with or without a note, padded numbers, ADR- prefixes', () => {
  assert.deepEqual(interpretRatification('1 accept; 002 reject\nADR-3 amend "rename it"\nadr4  amend', []), {
    kind: 'ratify',
    verdicts: [{ adr: '001', verdict: 'Accepted' }, { adr: '002', verdict: 'Rejected' }],
    amendments: [{ adr: '003', note: 'rename it' }, { adr: '004', note: '' }],
  })
  assert.deepEqual(interpretRatification('5 amend "only a note"', []), { kind: 'ratify', verdicts: [], amendments: [{ adr: '005', note: 'only a note' }] })
  assert.deepEqual(interpretRatification('6 reject', []), { kind: 'ratify', verdicts: [{ adr: '006', verdict: 'Rejected' }], amendments: [] })
  assert.deepEqual(interpretRatification('see 7 accept', []), { kind: 'pause' })
  assert.deepEqual(interpretRatification('later, maybe', []), { kind: 'pause' })
})

// ── Dispatch brief ───────────────────────────────────────────────────────────

const handoffOf = (role) => ({
  agent: role === 'specialist' ? 'architect' : 'architect-reviewer',
  phase: 'DESIGN',
  role,
  mode: HANDOFF_MODES.FIRST_PASS,
  required: [{ kind: 'tracked', resolved: true, paths: ['research/2026-10-05/findings.md'] }],
  context: [],
  underReview: [],
  previousReview: null,
  previousOutputs: [],
})
const PREFIX = '.copilot-tracking/skraft-plans/checkout/'

test('brief: a specialist brief — story, scope, outputs, both conventions, the handoff with the tracking prefix, the addenda', () => {
  const handoff = handoffOf('specialist')
  const brief = composeDispatchBrief({
    handoff, slug: 'checkout', story: { issue: 42, title: 'Pay by card' }, trackingPrefix: PREFIX,
    outputs: ['design/2026-10-05/architecture.md', 'design/2026-10-05/c4.md'],
    addenda: [reworkAddendum({ attempt: 2, maxAttempts: 3, findings: 'Fix X.' }), ENVIRONMENT_REGATE_ADDENDUM],
  })
  assert.equal(brief, [
    '## Skraft dispatch — architect (DESIGN specialist)',
    '- Story: #42 — Pay by card',
    '- Feature scope: checkout',
    '- Write your output exactly at:',
    `  - \`${PREFIX}design/2026-10-05/architecture.md\``,
    `  - \`${PREFIX}design/2026-10-05/c4.md\``,
    '- Markdown artefacts start with `<!-- markdownlint-disable-file -->`.',
    '- Commits: `git commit -s`, subject `type(feature): subject`, body ending with `Refs: #N` (or `Closes #N`).',
    '',
    renderHandoff(handoff, { trackingPrefix: PREFIX }),
    '',
    '## Reviewer findings (attempt 2 of 3)',
    'Fix X.\n\nRevise your output in place at the same dated paths.',
    '',
    '## Environment re-gate',
    'Re-run only the gates the previous review names inconclusive; change no code.',
  ].join('\n'))
  assert.match(brief, /`\.copilot-tracking\/skraft-plans\/checkout\/research\/2026-10-05\/findings\.md`/)
})

test('brief: a reviewer brief with no outputs nor addenda — no output list, no commit convention', () => {
  const handoff = handoffOf('reviewer')
  assert.equal(composeDispatchBrief({ handoff, slug: 'checkout', story: null, trackingPrefix: PREFIX }), [
    '## Skraft dispatch — architect-reviewer (DESIGN reviewer)',
    '- Story: none',
    '- Feature scope: checkout',
    '- Markdown artefacts start with `<!-- markdownlint-disable-file -->`.',
    '',
    renderHandoff(handoff, { trackingPrefix: PREFIX }),
  ].join('\n'))
})

test('brief: the story line — issue only, title only, neither', () => {
  const storyLine = (story) => composeDispatchBrief({ handoff: handoffOf('reviewer'), slug: 's', story, trackingPrefix: '' }).split('\n')[1]
  assert.equal(storyLine({ issue: 7 }), '- Story: #7')
  assert.equal(storyLine({ title: 'Only a title' }), '- Story: Only a title')
  assert.equal(storyLine({}), '- Story: none')
  assert.equal(storyLine({ issue: 0, title: '' }), '- Story: none')
  assert.equal(reviewOutputPath({ phase: 'DESIGN', date: '2026-10-05' }), 'reviews/2026-10-05/design-review-1.md')
})

// ── Run journal ──────────────────────────────────────────────────────────────

test('journal: a first run starts empty; a later one keeps the phase, the story, the log, the dispatches and the gates', () => {
  assert.deepEqual(journalStarted(null, { at: 'T1' }), {
    status: 'running', phase: null, reason: '', checkpoint: null, story: null, startedAt: 'T1', updatedAt: 'T1',
    log: [{ at: 'T1', message: 'run started' }], dispatches: [], qualityGates: null,
  })
  const previous = {
    status: 'blocked', phase: 'DESIGN', reason: 'stopped', story: { issue: 1 }, log: [{ at: 'T0', message: 'old' }],
    dispatches: Array.from({ length: MAX_JOURNAL_DISPATCHES + 1 }, (_, i) => ({ at: `d${i}` })),
    qualityGates: { verdict: 'pass' },
  }
  const next = journalStarted(previous, { at: 'T2' })
  assert.equal(next.phase, 'DESIGN')
  assert.equal(next.reason, '')
  assert.equal(next.status, 'running')
  assert.deepEqual(next.story, { issue: 1 })
  assert.deepEqual(next.log, [{ at: 'T0', message: 'old' }, { at: 'T2', message: 'run started' }])
  assert.equal(next.dispatches.length, MAX_JOURNAL_DISPATCHES)
  assert.equal(next.dispatches[0].at, 'd1')
  assert.deepEqual(next.qualityGates, { verdict: 'pass' })
})

test('journal: dispatches are bounded, a journal without any starts a list, usage is copied only when reported', () => {
  const full = { log: [], dispatches: Array.from({ length: MAX_JOURNAL_DISPATCHES }, (_, i) => ({ at: `d${i}` })) }
  const added = journalDispatch(full, { phase: 'DESIGN', role: 'specialist', agent: 'a', label: 'l', startedAt: 'T', durationMs: 5, ok: 1 })
  assert.equal(added.dispatches.length, MAX_JOURNAL_DISPATCHES)
  assert.deepEqual(added.dispatches.at(-1), { at: 'T', phase: 'DESIGN', role: 'specialist', agent: 'a', label: 'l', durationMs: 5, ok: true })
  assert.equal(added.dispatches[0].at, 'd1')

  const first = journalDispatch({ log: [] }, { phase: 'X', role: 'r', agent: 'a', label: 'l', startedAt: 'T', durationMs: 1, ok: false, usage: { credits: 1 } })
  assert.deepEqual(first.dispatches, [{ at: 'T', phase: 'X', role: 'r', agent: 'a', label: 'l', durationMs: 1, ok: false, usage: { credits: 1 } }])
  assert.equal(first.updatedAt, 'T')
})

test('journal: verification, awaiting, answered and finished entries', () => {
  const base = { status: 'running', phase: 'DELIVER', log: [] }
  const verified = journalVerification(base, { evidenceLog: 'e/qg.json', verdict: 'fail', findings: [{ code: 'X' }] }, 'T1')
  assert.deepEqual(verified.qualityGates, { evidenceLog: 'e/qg.json', verdict: 'fail', findings: [{ code: 'X' }], at: 'T1' })
  assert.deepEqual(journalVerification(base, { evidenceLog: 'e', verdict: 'pass' }, 'T1').qualityGates.findings, [])
  assert.deepEqual(verified.log, [{ at: 'T1', message: 'quality gates e/qg.json: fail' }])

  const awaiting = journalAwaiting(base, { key: 'k', question: 'q?' }, 'T2')
  assert.deepEqual(awaiting.checkpoint, { key: 'k', question: 'q?', options: [] })
  assert.equal(awaiting.status, 'awaiting-human')
  assert.equal(awaiting.reason, 'q?')

  const answered = journalAnswered(awaiting, 'k', 'T3')
  assert.equal(answered.reason, '')
  assert.equal(answered.status, 'running')
  assert.equal(answered.checkpoint, null)

  const done = journalFinished(base, { status: 'done', phase: 'DONE' }, 'T4')
  assert.equal(done.phase, 'DONE')
  assert.equal(done.reason, '')
  assert.equal(done.checkpoint, null)
  assert.deepEqual(done.log, [{ at: 'T4', message: 'done' }])

  const halted = journalFinished(base, { status: 'awaiting-human', reason: 'a question', checkpoint: { key: 'k', question: 'q' } }, 'T5')
  assert.equal(halted.phase, 'DELIVER')
  assert.deepEqual(halted.checkpoint, { key: 'k', question: 'q', options: [] })
  assert.deepEqual(halted.log, [{ at: 'T5', message: 'awaiting-human — a question' }])
})

// ── Cost ─────────────────────────────────────────────────────────────────────

test('cost: no dispatch and no phase — an empty total, no group', () => {
  const cost = pipelineCost({})
  assert.deepEqual(cost, {
    eurPerUsd: null,
    total: { dispatches: 0, reported: 0, credits: null, usd: null, eur: null, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, requests: 0, durationMs: 0 },
    byPhase: [],
    dispatches: [],
  })
})

test('cost: dollars without credits keep credits null; a non-number credit is no credit; tokens are summed', () => {
  const cost = pipelineCost({
    dispatches: [
      { at: 'T1', phase: 'DESIGN', role: 'specialist', agent: 'a', durationMs: 10, ok: true, usage: { usd: 0.5, inputTokens: 100, outputTokens: 20, cacheReadTokens: 7, requests: 1, model: 'm' } },
      { at: 'T2', phase: 'DESIGN', role: 'reviewer', agent: 'b', ok: true, usage: { credits: '5', inputTokens: 1 } },
      { at: 'T3', phase: 'DESIGN', role: 'reviewer', agent: 'c', ok: false },
    ],
    phases: ['DESIGN'],
    eurPerUsd: 0.9,
  })
  assert.deepEqual(cost.total, { dispatches: 3, reported: 2, credits: null, usd: 0.5, eur: 0.45, inputTokens: 101, outputTokens: 20, cacheReadTokens: 7, requests: 1, durationMs: 10 })
  assert.deepEqual(cost.dispatches, [
    { at: 'T1', phase: 'DESIGN', role: 'specialist', agent: 'a', durationMs: 10, ok: true, model: 'm', tokens: 120, credits: null, usd: 0.5, eur: 0.45 },
    { at: 'T2', phase: 'DESIGN', role: 'reviewer', agent: 'b', durationMs: null, ok: true, model: null, tokens: 1, credits: null, usd: null, eur: null },
    { at: 'T3', phase: 'DESIGN', role: 'reviewer', agent: 'c', durationMs: null, ok: false, model: null, tokens: null, credits: null, usd: null, eur: null },
  ])
})

test('cost: credits are rounded per dispatch; no rate, or a rate that is not positive, gives no euros', () => {
  const dispatches = [{ at: 'T', phase: 'DELIVER', usage: { credits: 1.256 } }, { at: 'T', phase: 'DELIVER' }]
  const priced = pipelineCost({ dispatches, phases: ['DELIVER'], eurPerUsd: 2 })
  assert.equal(priced.dispatches[0].credits, 1.26)
  assert.equal(priced.dispatches[0].eur, 0.0251)
  assert.equal(priced.dispatches[1].eur, null)
  for (const eurPerUsd of [null, 0, -1, '0.9']) {
    const cost = pipelineCost({ dispatches, phases: ['DELIVER'], eurPerUsd })
    assert.equal(cost.eurPerUsd, null)
    assert.equal(cost.total.eur, null)
    assert.equal(cost.dispatches[0].eur, null)
  }
  const unpriced = pipelineCost({ dispatches: [{ at: 'T', phase: 'X' }], phases: [], eurPerUsd: 0.9 })
  assert.equal(unpriced.total.eur, null)
  assert.deepEqual(unpriced.byPhase.map((group) => group.phase), ['X'])
})

// ── Manual closure ───────────────────────────────────────────────────────────

test('manual closure: the closing review data, exactly', () => {
  const weight = (w) => ({ answered_by: ['human-validation'], weight: w, contribution: w })
  assert.deepEqual(manualClosureReview(), {
    verdict: 'APPROVED',
    confidence: 'high',
    lenses: { 'human-validation': { status: 'pass', findings: ['Closed after human-validated manual reworks; no reviewer sub-agent dispatched.'] } },
    synthesis: {
      questions: { completeness: weight(0.30), 'business-fit': weight(0.30), quality: weight(0.15), risk: weight(0.25) },
      blocking_findings: [],
      recommendations: [],
      dissent: 'No reviewer sub-agent was dispatched.',
    },
  })
})

test('manual closure: the refusals and their reasons', () => {
  assert.deepEqual(manualClosureRefusal({ currentPhase: 'DONE' }), { code: 'PIPELINE_DONE', reason: 'the pipeline is DONE; nothing to close' })
  assert.deepEqual(manualClosureRefusal({ phase: 'DELIVER', currentPhase: 'DESIGN', reviewer: 'r' }), { code: 'PHASE_MISMATCH', reason: 'DELIVER is not the open phase (DESIGN)' })
  assert.deepEqual(manualClosureRefusal({ currentPhase: 'RESEARCH' }), { code: 'NO_REVIEWER', reason: 'RESEARCH has no reviewer; the pipeline closes it itself' })
  assert.equal(manualClosureRefusal({ phase: 'DESIGN', currentPhase: 'DESIGN', reviewer: 'r' }), null)
})

// ── Review outcome ───────────────────────────────────────────────────────────

test('review outcome: the environment escalation is a whole line, quoted or not, trailing blanks allowed', () => {
  const escalation = (text) => readReviewOutcome(`verdict: NEEDS_REWORK\n${text}\n`).escalation
  assert.equal(escalation('escalation: environment'), 'environment')
  assert.equal(escalation('escalation:environment'), 'environment')
  assert.equal(escalation('escalation: "environment"'), 'environment')
  assert.equal(escalation('escalation: environment   '), 'environment')
  assert.equal(escalation('escalation: environment later'), null)
  assert.equal(escalation('  escalation: environment'), null)
  assert.equal(escalation('escalation: none'), null)
  assert.deepEqual(readReviewOutcome(undefined), { verdict: null, escalation: null, findings: '' })
})

test('review outcome: findings kept whole up to 20 000 characters, truncated beyond', () => {
  const exact = 'x'.repeat(20_000)
  assert.equal(readReviewOutcome(exact).findings, exact)
  const longer = `${'y'.repeat(20_000)}z`
  assert.equal(readReviewOutcome(longer).findings, `${'y'.repeat(20_000)}\n…(truncated)`)
})

// ── Expected outputs ─────────────────────────────────────────────────────────

test('expected outputs: only patterns under the tracking prefix, relative to it; no config, no outputs', () => {
  const config = {
    agentArtifacts: {
      architect: {
        outputs: [
          '.copilot-tracking/skraft-plans/{projectSlug}/design/{date}/architecture.md',
          '.copilot-tracking/skraft-plans/{projectSlug}/design/{date}/notes.md (optional)',
          'docs/.copilot-tracking/skraft-plans/{projectSlug}/x.md',
          'docs/adr/ADR-*.md',
        ],
      },
    },
  }
  assert.deepEqual(expectedTrackedOutputs('architect', config), [
    { pattern: 'design/{date}/architecture.md', optional: false },
    { pattern: 'design/{date}/notes.md', optional: true },
  ])
  assert.deepEqual(expectedTrackedOutputs('architect', undefined), [])
  assert.deepEqual(expectedTrackedOutputs('architect', {}), [])
  assert.deepEqual(expectedTrackedOutputs('nobody', config), [])
})

test('expected outputs: found sorted and unique, the latest evidence log by path, the structural scan', () => {
  assert.deepEqual(matchOutputs(['d/b.md', 'd/a.md', 'x.txt'], [{ pattern: 'd/*.md', optional: false }, { pattern: 'd/a.md', optional: false }, { pattern: 'e/*.md', optional: false }]),
    { found: ['d/a.md', 'd/b.md'], missing: ['e/*.md'] })
  assert.equal(latestEvidenceLog(['evidence/2026-10-02/s/qg-s.json', 'evidence/2026-10-01/s/qg-s.json']), 'evidence/2026-10-02/s/qg-s.json')
  assert.equal(latestEvidenceLog(['qg-root.json']), 'qg-root.json')
  assert.equal(latestEvidenceLog(['evidence/s/qg-s.json.bak', 'evidence/s/notqg-s.json']), null)
  assert.equal(hasStructuralScan(undefined), false)
  assert.equal(hasStructuralScan({}), false)
  assert.equal(hasStructuralScan({ phaseArtifacts: { RESEARCH: ['details/2026-10-05/structural-scan.json'] } }), true)
})

// ── Progress inference ───────────────────────────────────────────────────────

test('progress: review files are the dated ones at the tracking root', () => {
  assert.deepEqual(reviewFilesOf('DESIGN', [
    'reviews/2026-10-01/design-review-1.md',
    'old/reviews/2026-10-02/design-review-1.md',
    'reviews/2026-10-03/design-review-1.md.bak',
  ]), ['reviews/2026-10-01/design-review-1.md'])
})

test('progress: a phase counts only with a specialist, every required output, and at least one output', () => {
  const tracked = (path) => `.copilot-tracking/skraft-plans/{projectSlug}/${path}`
  const none = () => null
  assert.deepEqual(inferCompletedPhases({ phaseOrder: ['RESEARCH'], config: {}, files: ['r.md'], approvedReview: none }), [])

  const noSpecialist = {
    phaseAgents: { RESEARCH: {} },
    agentArtifacts: { undefined: { outputs: [tracked('r.md')] } },
  }
  assert.deepEqual(inferCompletedPhases({ phaseOrder: ['RESEARCH'], config: noSpecialist, files: ['r.md'], approvedReview: none }), [])

  const missingOne = {
    phaseAgents: { RESEARCH: { specialist: 'researcher' } },
    agentArtifacts: { researcher: { outputs: [tracked('r.md'), tracked('s.md')] } },
  }
  assert.deepEqual(inferCompletedPhases({ phaseOrder: ['RESEARCH'], config: missingOne, files: ['r.md'], approvedReview: none }), [])
  assert.deepEqual(inferCompletedPhases({ phaseOrder: ['RESEARCH'], config: missingOne, files: ['r.md', 's.md'], approvedReview: none }),
    [{ phase: 'RESEARCH', artifacts: ['r.md', 's.md'], review: null }])

  const noOutputs = { phaseAgents: { RESEARCH: { specialist: 'silent' } }, agentArtifacts: {} }
  assert.deepEqual(inferCompletedPhases({ phaseOrder: ['RESEARCH'], config: noOutputs, files: ['r.md'], approvedReview: none }), [])

  const doneDeclared = {
    phaseAgents: { RESEARCH: { specialist: 'researcher' }, DONE: { specialist: 'researcher' } },
    agentArtifacts: { researcher: { outputs: [tracked('r.md')] } },
  }
  assert.deepEqual(inferCompletedPhases({ phaseOrder: ['RESEARCH', 'DONE'], config: doneDeclared, files: ['r.md'], approvedReview: none }),
    [{ phase: 'RESEARCH', artifacts: ['r.md'], review: null }], 'DONE is never a phase to complete')
})

// ── Test results ─────────────────────────────────────────────────────────────

test('tests: gates that are not objects are skipped; labels, rationale only when not applicable, counts only from counted gates', () => {
  const results = testResults({
    evidence: {
      gates: [
        null,
        'junk',
        { id: 'unit', label: 'Unit tests', status: 'pass', rationale: 'ignored', metrics: { tests_total: 10, tests_passed: 9, tests_failed: 1 } },
        { id: 'lint', scope: 'src', status: 'not_applicable', rationale: 'no sources' },
        { id: 'mutation', status: 'pass' },
      ],
    },
  })
  assert.deepEqual(results.gates, [
    { id: 'unit', label: 'Unit tests', status: 'pass', total: 10, passed: 9, failed: 1, rationale: null },
    { id: 'lint/src', label: 'lint', status: 'not_applicable', total: null, passed: null, failed: null, rationale: 'no sources' },
    { id: 'mutation', label: 'mutation', status: 'pass', total: null, passed: null, failed: null, rationale: null },
  ])
  assert.deepEqual(results.tests, { total: 10, passed: 9, failed: 1 })
  assert.equal(results.cycles, null)
})

test('tests: gates without a test count give no test totals', () => {
  const results = testResults({ evidence: { gates: [{ id: 'lint', status: 'pass' }], test_integrity: {} } })
  assert.equal(results.tests, null)
  assert.equal(results.cycles, null)
  assert.equal(testResults({ evidence: { test_integrity: { cycles: [1, 2] } } }).cycles, 2)
})

// ── Step policy and pipeline definition ──────────────────────────────────────

test('step: a phase with no verdict yet starts with its specialist, whatever its last review says', () => {
  assert.deepEqual(stepOnEntry({ verdict: null, lastReview: { verdict: 'REJECTED', findings: 'f' }, attempt: 1, maxAttempts: 3 }), specialist())
  assert.deepEqual(stepOnEntry({ verdict: undefined, lastReview: { escalation: 'environment', findings: 'f' } }), specialist())
})

test('definition: only the pipeline names itself as the dispatcher', () => {
  assert.equal(isPipelineDispatcher(PIPELINE_DISPATCHER), true)
  assert.equal(isPipelineDispatcher('skraft-pipeline'), true)
  assert.equal(isPipelineDispatcher('skraft-orchestrator'), false)
  assert.equal(isPipelineDispatcher(undefined), false)
})
