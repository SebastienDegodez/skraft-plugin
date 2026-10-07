import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateDispatch } from '../../../plugins/skraft-framework/src/domain/dispatch-policy.mjs'
import { PIPELINE_DISPATCHER } from '../../../plugins/skraft-framework/src/domain/pipeline/pipeline-definition.mjs'

// --- descriptor factories (the pure function's input boundary) ---

// The launcher: a root a person invokes; it starts the pipeline, which runs as code.
const launcher = (overrides = {}) => ({
  name: 'skraft-orchestrator',
  phases: [],
  dispatchedBy: undefined,
  userInvocable: true,
  ...overrides,
})

// A phase agent: the pipeline dispatches it.
const child = (overrides = {}) => ({
  name: 'some-agent',
  phases: [],
  dispatchedBy: PIPELINE_DISPATCHER,
  ...overrides,
})

const codes = (violations) => violations.map((v) => v.code)
const agents = (violations) => violations.map((v) => v.agent)

test('a well-formed graph (launcher, pipeline-dispatched phase agents, their own children) has no violations', () => {
  const violations = validateDispatch([
    launcher(),
    child({ name: 'software-engineer', phase: 'DELIVER' }),
    child({ name: 'cold-reader-lens', dispatchedBy: 'software-engineer-reviewer' }),
  ])
  assert.deepEqual(violations, [])
})

test('the phase order is declared in code: an agent that declares metadata.phases is refused', () => {
  const violations = validateDispatch([launcher({ phases: ['RESEARCH', 'DELIVER'] })])
  assert.deepEqual(codes(violations), ['PHASES_IN_AGENT'])
  assert.deepEqual(agents(violations), ['skraft-orchestrator'])
  assert.match(violations[0].message, /declared in code .*pipeline-definition\.mjs/)
})

test('a non-root agent without a parent is an orphan', () => {
  const violations = validateDispatch([launcher(), child({ name: 'lonely-lens', dispatchedBy: undefined })])
  assert.deepEqual(codes(violations), ['ORPHAN_AGENT'])
  assert.deepEqual(agents(violations), ['lonely-lens'])
  assert.match(violations[0].message, /must declare dispatched_by/)
})

test('an empty-string parent is treated as no parent (orphan)', () => {
  const violations = validateDispatch([launcher(), child({ name: 'blank', dispatchedBy: '   ' })])
  assert.deepEqual(codes(violations), ['ORPHAN_AGENT'])
})

test('all violations are collected, not failed-fast, and the result is frozen', () => {
  const violations = validateDispatch([
    launcher({ phases: ['RESEARCH'] }), // PHASES_IN_AGENT
    child({ name: 'orphan', dispatchedBy: undefined }), // ORPHAN_AGENT
  ])
  assert.deepEqual(codes(violations).sort(), ['ORPHAN_AGENT', 'PHASES_IN_AGENT'])
  assert.throws(() => violations.push({}))
})

// --- roots: independent, user-invocable entry points ---

const standalone = (overrides = {}) => ({
  name: 'brownfield-analyst',
  phase: undefined,
  phases: [],
  dispatchedBy: undefined,
  userInvocable: true,
  ...overrides,
})

test('several user-invocable roots coexist: the pipeline launcher and the standalone workflows', () => {
  const violations = validateDispatch([
    launcher(),
    standalone({ name: 'brownfield-analyst' }),
    standalone({ name: 'brownfield-harness-builder' }),
  ])
  assert.deepEqual(violations, [])
})

test('a user-invocable agent that declares a parent is a valid dispatched child', () => {
  const violations = validateDispatch([launcher(), standalone({ dispatchedBy: 'Skraft - Backlog Planner' })])
  assert.deepEqual(violations, [])
})

test('a user-invocable phase agent is NOT a root and stays an orphan without dispatched_by', () => {
  const violations = validateDispatch([
    launcher(),
    child({ name: 'backlog-discoverer', phase: 'DISCOVER', userInvocable: true, dispatchedBy: undefined }),
  ])
  assert.deepEqual(codes(violations), ['ORPHAN_AGENT'])
})

test('a non-invocable agent with no phase and no parent is still an orphan (invocability is the signal)', () => {
  const violations = validateDispatch([launcher(), standalone({ userInvocable: false })])
  assert.deepEqual(codes(violations), ['ORPHAN_AGENT'])
})
