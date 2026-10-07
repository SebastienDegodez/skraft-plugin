import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildHandoff,
  evaluateHandoff,
  renderHandoff,
  HANDOFF_MODES,
} from '../../../plugins/skraft-framework/src/domain/handoff-policy.mjs'

const T = '.copilot-tracking/skraft-plans/{projectSlug}/'

const CONFIG = {
  phaseOrder: ['RESEARCH', 'DESIGN', 'DELIVER'],
  phaseAgents: {
    RESEARCH: { specialist: 'researcher', reviewer: null },
    DESIGN: { specialist: 'architect', reviewer: 'architect-reviewer' },
    DELIVER: { specialist: 'engineer', reviewer: 'engineer-reviewer' },
  },
  agentArtifacts: {
    engineer: { inputs: [`${T}notes/{name}.md`], outputs: [] },
    'engineer-reviewer': { inputs: [`${T}notes/{name}.md`], outputs: [] },
  },
  agentContext: {},
}

test('HANDOFF_MODES: names each mode with its wire value', () => {
  assert.deepEqual({ ...HANDOFF_MODES }, { FIRST_PASS: 'first-pass', REWORK: 'rework', RE_REVIEW: 're-review' })
  assert.equal(Object.isFrozen(HANDOFF_MODES), true)
})

test('buildHandoff: the tracking prefix is only recognised at the start of an entry', () => {
  const config = {
    ...CONFIG,
    agentArtifacts: { engineer: { inputs: [`docs/${T}x.md`] } },
  }
  const handoff = buildHandoff({ agent: 'engineer', state: { currentPhase: 'DELIVER' }, config }).value
  assert.equal(handoff.required[0].kind, 'repository')
  assert.equal(handoff.required[0].pattern, `docs/${T}x.md`)
})

test('buildHandoff: a minimal state (no artefacts, verdicts, retries, reviews or preferences) yields defaults', () => {
  const reviewer = buildHandoff({ agent: 'engineer-reviewer', state: { currentPhase: 'DELIVER' }, config: CONFIG })
  assert.equal(reviewer.ok, true)
  assert.deepEqual({ ...reviewer.value }, {
    agent: 'engineer-reviewer',
    phase: 'DELIVER',
    role: 'reviewer',
    mode: 'first-pass',
    attempt: 1,
    maxAttempts: 3,
    required: [{ kind: 'tracked', input: `${T}notes/{name}.md`, pattern: 'notes/{name}.md', paths: [], resolved: false }],
    context: [],
    underReview: [],
    previousReview: null,
    previousOutputs: [],
  })
  assert.equal(Object.isFrozen(reviewer.value), true)
})

test('buildHandoff: a config without agentArtifacts/agentContext gives no inputs', () => {
  const config = { phaseOrder: CONFIG.phaseOrder, phaseAgents: CONFIG.phaseAgents }
  const handoff = buildHandoff({ agent: 'engineer', state: { currentPhase: 'DELIVER' }, config }).value
  assert.deepEqual(handoff.required, [])
  assert.deepEqual(handoff.context, [])
})

test('buildHandoff: an agent whose artefacts declare no inputs has an empty required list', () => {
  const config = { ...CONFIG, agentArtifacts: { engineer: { outputs: [] } } }
  const handoff = buildHandoff({ agent: 'engineer', state: { currentPhase: 'DELIVER' }, config }).value
  assert.deepEqual(handoff.required, [])
})

test('buildHandoff: tolerates an absent state when the open phase is itself unset', () => {
  const config = {
    phaseOrder: [undefined],
    phaseAgents: { undefined: { specialist: 'ghost', reviewer: null } },
    agentArtifacts: { ghost: { inputs: [] } },
  }
  const handoff = buildHandoff({ agent: 'ghost', state: undefined, config })
  assert.equal(handoff.ok, true)
  assert.equal(handoff.value.mode, 'first-pass')
  assert.equal(handoff.value.attempt, 1)
  assert.equal(handoff.value.maxAttempts, 3)
  assert.equal(handoff.value.previousReview, null)
  assert.deepEqual(handoff.value.underReview, [])
})

test('buildHandoff: error reasons name the agent and the open phase', () => {
  const ungoverned = buildHandoff({ agent: 'lens-x', state: { currentPhase: 'DELIVER' }, config: CONFIG })
  assert.deepEqual(ungoverned.error, {
    code: 'UNGOVERNED',
    reason: 'lens-x is not a pipeline phase agent; its dispatcher supplies its inputs',
  })
  const wrong = buildHandoff({ agent: 'architect', state: { currentPhase: 'DELIVER' }, config: CONFIG })
  assert.deepEqual(wrong.error, { code: 'WRONG_PHASE', reason: 'architect runs in DESIGN, but DELIVER is open' })
  const noState = buildHandoff({ agent: 'architect', state: undefined, config: CONFIG })
  assert.deepEqual(noState.error, { code: 'WRONG_PHASE', reason: 'architect runs in DESIGN, but no phase is open' })
  const noPhase = buildHandoff({ agent: 'architect', state: {}, config: CONFIG })
  assert.equal(noPhase.error.reason, 'architect runs in DESIGN, but no phase is open')
})

test('buildHandoff: artefacts of a phase missing from phaseOrder still resolve, phase order first', () => {
  const state = {
    currentPhase: 'DELIVER',
    phaseArtifacts: {
      EXTRA: ['notes/c.md'],
      DESIGN: ['notes/b.md'],
      RESEARCH: ['notes/a.md'],
    },
  }
  const handoff = buildHandoff({ agent: 'engineer', state, config: CONFIG }).value
  assert.deepEqual(handoff.required[0].paths, ['notes/a.md', 'notes/b.md', 'notes/c.md'])
  assert.equal(handoff.required[0].resolved, true)
})

test('buildHandoff: maxRetriesPerPhase from preferences sets maxAttempts', () => {
  const state = { currentPhase: 'DELIVER', userPreferences: { maxRetriesPerPhase: 5 }, retryCount: { DELIVER: 4 } }
  const handoff = buildHandoff({ agent: 'engineer', state, config: CONFIG }).value
  assert.equal(handoff.attempt, 5)
  assert.equal(handoff.maxAttempts, 6)
  const zero = buildHandoff({ agent: 'engineer', state: { currentPhase: 'DELIVER', userPreferences: { maxRetriesPerPhase: 0 } }, config: CONFIG }).value
  assert.equal(zero.maxAttempts, 1)
})

test('buildHandoff: a first pass ignores recorded reviews and a specialist has nothing under review', () => {
  const state = {
    currentPhase: 'DELIVER',
    phaseArtifacts: { DELIVER: ['changes/log.md'] },
    reviewArtifacts: { DELIVER: ['reviews/r1.md'] },
    verdicts: { DELIVER: 'APPROVED' },
  }
  const handoff = buildHandoff({ agent: 'engineer', state, config: CONFIG }).value
  assert.equal(handoff.mode, 'first-pass')
  assert.equal(handoff.previousReview, null)
  assert.deepEqual(handoff.underReview, [])
  assert.deepEqual(handoff.previousOutputs, [])
})

test('buildHandoff: a rework with no recorded review has no previous review', () => {
  const state = { currentPhase: 'DELIVER', verdicts: { DELIVER: 'CHANGES_REQUESTED' } }
  const handoff = buildHandoff({ agent: 'engineer', state, config: CONFIG }).value
  assert.equal(handoff.mode, 'rework')
  assert.equal(handoff.previousReview, null)
  assert.deepEqual(handoff.previousOutputs, [])
})

test('evaluateHandoff: a refused build is passed through as Ok with no missing inputs', () => {
  const result = evaluateHandoff({ agent: 'lens-x', state: { currentPhase: 'DELIVER' }, config: CONFIG, prompt: '' })
  assert.deepEqual(result, {
    ok: true,
    value: { reason: 'lens-x is not a pipeline phase agent; its dispatcher supplies its inputs', missing: [] },
  })
})

test('evaluateHandoff: ratification by a specialist returns its reason and no missing input', () => {
  const state = {
    currentPhase: 'DELIVER',
    phaseArtifacts: { DESIGN: ['notes/a.md'] },
    verdicts: { DELIVER: 'APPROVED' },
  }
  const result = evaluateHandoff({ agent: 'engineer', state, config: CONFIG, prompt: '' })
  assert.equal(result.ok, true)
  assert.deepEqual(result.value, { reason: 'engineer runs after DELIVER was approved (ratification)', missing: [] })
})

test('evaluateHandoff: a reviewer is judged even after its phase was approved', () => {
  const state = {
    currentPhase: 'DELIVER',
    phaseArtifacts: { DESIGN: ['notes/a.md'] },
    verdicts: { DELIVER: 'APPROVED' },
  }
  const result = evaluateHandoff({ agent: 'engineer-reviewer', state, config: CONFIG, prompt: '' })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'HANDOFF_INCOMPLETE')
})

test('evaluateHandoff: a specialist with a minimal state (no verdicts) is judged', () => {
  const result = evaluateHandoff({ agent: 'engineer', state: { currentPhase: 'DELIVER' }, config: CONFIG, prompt: 'x' })
  assert.deepEqual(result, {
    ok: true,
    value: { reason: 'engineer receives every recorded required input', missing: [] },
  })
})

test('evaluateHandoff: a non-string prompt names no recorded path at all', () => {
  const state = { currentPhase: 'DELIVER', phaseArtifacts: { DESIGN: ['notes/fine.md', 'notes/here.md'] } }
  const config = { ...CONFIG, agentArtifacts: { engineer: { inputs: [`${T}notes/{name}`] } } }
  // The paths are chosen so that they would be found inside a stringified placeholder prompt.
  const stateBare = { currentPhase: 'DELIVER', phaseArtifacts: { DESIGN: ['fine', 'here'] } }
  const bareConfig = { ...CONFIG, agentArtifacts: { engineer: { inputs: [`${T}{name}`] } } }
  const bare = evaluateHandoff({ agent: 'engineer', state: stateBare, config: bareConfig, prompt: undefined })
  assert.equal(bare.ok, false)
  assert.deepEqual(bare.error.missing.map(({ expected }) => expected[0]), ['fine', 'here'])
  const numeric = evaluateHandoff({ agent: 'engineer', state, config, prompt: 42 })
  assert.equal(numeric.error.missing.length, 2)
})

test('evaluateHandoff: the refusal reason lists each missing input and its expected path', () => {
  const state = {
    currentPhase: 'DELIVER',
    phaseArtifacts: { DESIGN: ['notes/a.md', 'notes/b.md'] },
    verdicts: { DELIVER: 'CHANGES_REQUESTED' },
    reviewArtifacts: { DELIVER: ['reviews/r1.md'] },
  }
  const result = evaluateHandoff({ agent: 'engineer', state, config: CONFIG, prompt: 'notes/a.md' })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'HANDOFF_INCOMPLETE')
  assert.equal(
    result.error.reason,
    `dispatch of engineer omits recorded inputs: ${T}notes/{name}.md → notes/b.md; previous review with the findings → reviews/r1.md; paste the block \`state.mjs handoff --agent "engineer"\` prints`,
  )
})

const handoffOf = (fields) => ({
  agent: 'engineer',
  phase: 'DELIVER',
  role: 'specialist',
  mode: HANDOFF_MODES.FIRST_PASS,
  attempt: 1,
  maxAttempts: 3,
  required: [],
  context: [],
  underReview: [],
  previousReview: null,
  previousOutputs: [],
  ...fields,
})

test('renderHandoff: an empty handoff renders the header and "none declared" only', () => {
  assert.equal(renderHandoff(handoffOf({})), [
    '### Handoff (from `state.mjs handoff` — pasted verbatim)',
    '- Agent: engineer (DELIVER specialist)',
    '- Mode: first pass',
    '- Required inputs — read them; do not re-derive what they already settle:',
    '  - none declared',
  ].join('\n'))
})

test('renderHandoff: a resolved input lists every path, one per line, under the prefix', () => {
  const required = [{ kind: 'tracked', input: 'x', pattern: 'notes/{n}.md', paths: ['notes/a.md', 'notes/b.md'], resolved: true }]
  const block = renderHandoff(handoffOf({ required }), { trackingPrefix: 'P/' })
  assert.equal(block.split('\n').slice(4).join('\n'), '  - `P/notes/a.md`\n  - `P/notes/b.md`')
})

test('renderHandoff: a re-review lists the mode line, the artefacts under review and the previous review', () => {
  const block = renderHandoff(handoffOf({
    agent: 'engineer-reviewer',
    role: 'reviewer',
    mode: HANDOFF_MODES.RE_REVIEW,
    attempt: 2,
    maxAttempts: 4,
    underReview: ['changes/a.md', 'changes/b.md'],
    previousReview: 'reviews/r1.md',
  }), { trackingPrefix: 'P/' })
  assert.equal(block, [
    '### Handoff (from `state.mjs handoff` — pasted verbatim)',
    '- Agent: engineer-reviewer (DELIVER reviewer)',
    '- Mode: re-review — attempt 2 of 4. Apply incremental re-review: re-run the lenses that had findings and the lenses whose inputs changed; carry forward the previous review\'s pass verdicts for the others',
    '- Required inputs — read them; do not re-derive what they already settle:',
    '  - none declared',
    '- Artefacts under review:',
    '  - `P/changes/a.md`',
    '  - `P/changes/b.md`',
    '- Previous review (its findings drive this pass): `P/reviews/r1.md`',
  ].join('\n'))
})

test('renderHandoff: a rework lists the previous outputs and context inputs', () => {
  const block = renderHandoff(handoffOf({
    mode: HANDOFF_MODES.REWORK,
    attempt: 3,
    maxAttempts: 3,
    context: [{ kind: 'note', input: 'Ask the team', paths: [], resolved: false }],
    previousOutputs: ['changes/a.md'],
  }))
  assert.equal(block, [
    '### Handoff (from `state.mjs handoff` — pasted verbatim)',
    '- Agent: engineer (DELIVER specialist)',
    '- Mode: rework — attempt 3 of 3. Apply rework mode: change only what the previous review\'s findings name; keep every other artefact, decision and passing gate as it is',
    '- Required inputs — read them; do not re-derive what they already settle:',
    '  - none declared',
    '- Context inputs — consult when a step needs them:',
    '  - Ask the team — supply it',
    '- Your previous output (edit it in place):',
    '  - `changes/a.md`',
  ].join('\n'))
})
