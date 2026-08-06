import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateDispatch } from '../../plugins/skraft-framework/src/domain/dispatch-policy.mjs'

// --- descriptor factories (the pure function's input boundary) ---

// The root is the single entry-point: it declares the phase order, nothing dispatches it.
const root = (overrides = {}) => ({
  name: 'skraft-orchestrator',
  phases: ['DISCOVER', 'DELIVER'],
  dispatchedBy: undefined,
  ...overrides,
})

const child = (overrides = {}) => ({
  name: 'some-agent',
  phases: [],
  dispatchedBy: 'skraft-orchestrator',
  ...overrides,
})

const codes = (violations) => violations.map((v) => v.code)
const agents = (violations) => violations.map((v) => v.agent)

test('a well-formed graph (root + dispatched children) has no violations', () => {
  const violations = validateDispatch([
    root(),
    child({ name: 'software-engineer', dispatchedBy: 'skraft-orchestrator' }),
    child({ name: 'cold-reader-lens', dispatchedBy: 'software-engineer-reviewer' }),
  ])
  assert.deepEqual(violations, [])
})

test('a non-root agent without a parent is an orphan', () => {
  const violations = validateDispatch([root(), child({ name: 'lonely-lens', dispatchedBy: undefined })])
  assert.deepEqual(codes(violations), ['ORPHAN_AGENT'])
  assert.deepEqual(agents(violations), ['lonely-lens'])
  assert.match(violations[0].message, /must declare dispatched_by/)
})

test('an empty-string parent is treated as no parent (orphan)', () => {
  const violations = validateDispatch([root(), child({ name: 'blank', dispatchedBy: '   ' })])
  assert.deepEqual(codes(violations), ['ORPHAN_AGENT'])
})

test('an agent with an empty phases list is not the root (so a missing parent is an orphan)', () => {
  const violations = validateDispatch([root(), child({ name: 'no-phases', phases: [], dispatchedBy: undefined })])
  assert.deepEqual(codes(violations), ['ORPHAN_AGENT'])
})

test('the root must not declare a parent', () => {
  const violations = validateDispatch([root({ dispatchedBy: 'someone' })])
  assert.deepEqual(codes(violations), ['ROOT_WITH_PARENT'])
  assert.deepEqual(agents(violations), ['skraft-orchestrator'])
  assert.match(violations[0].message, /must not declare dispatched_by/)
})

test('a child that declares a parent is valid (no violation)', () => {
  const violations = validateDispatch([root(), child({ name: 'fine', dispatchedBy: 'software-engineer' })])
  assert.deepEqual(violations, [])
})

test('all violations are collected, not failed-fast, and the result is frozen', () => {
  const violations = validateDispatch([
    root({ dispatchedBy: 'x' }), // ROOT_WITH_PARENT
    child({ name: 'orphan', dispatchedBy: undefined }), // ORPHAN_AGENT
  ])
  assert.deepEqual(codes(violations).sort(), ['ORPHAN_AGENT', 'ROOT_WITH_PARENT'])
  assert.throws(() => violations.push({}))
})

// --- standalone roots: independent, user-invocable workflows outside the pipeline ---

const standalone = (overrides = {}) => ({
  name: 'brownfield-analyst',
  phase: undefined,
  phases: [],
  dispatchedBy: undefined,
  userInvocable: true,
  ...overrides,
})

test('a user-invocable agent with no phase and no parent is a valid standalone root', () => {
  const violations = validateDispatch([root(), standalone()])
  assert.deepEqual(violations, [])
})

test('multiple independent standalone roots coexist alongside the phase root', () => {
  const violations = validateDispatch([
    root(),
    standalone({ name: 'brownfield-analyst' }),
    standalone({ name: 'brownfield-harness-builder' }),
  ])
  assert.deepEqual(violations, [])
})

test('a standalone root that declares a parent is treated as a valid dispatched child', () => {
  const violations = validateDispatch([root(), standalone({ dispatchedBy: 'skraft-orchestrator' })])
  assert.deepEqual(violations, [])
})

test('a user-invocable pipeline specialist is NOT a standalone root and stays an orphan without dispatched_by', () => {
  const violations = validateDispatch([
    root(),
    child({ name: 'backlog-discoverer', phase: 'DISCOVER', userInvocable: true, dispatchedBy: undefined }),
  ])
  assert.deepEqual(codes(violations), ['ORPHAN_AGENT'])
})

test('a non-invocable agent with no phase and no parent is still an orphan (invocability is the signal)', () => {
  const violations = validateDispatch([root(), standalone({ userInvocable: false })])
  assert.deepEqual(codes(violations), ['ORPHAN_AGENT'])
})
