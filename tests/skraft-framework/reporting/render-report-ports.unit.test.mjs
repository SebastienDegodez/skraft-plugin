// Unit tests: the ports of renderReport (application/render-report.mjs) — which are required,
// how each reference is read (once, never empty, missing vs failing) and what a non-text
// answer means. Templates are tiny test templates, not the bundled ones.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { renderReport } from '../../../plugins/skraft-framework/src/application/render-report.mjs'

const hashText = (text) => createHash('sha256').update(text, 'utf8').digest('hex')
const REVISION = 'e8b963a1f70c4d229e10b348a69f5c71d231809e'
const ROOT = '.copilot-tracking/skraft-plans/checkout'
const PLAN = `${ROOT}/details/test-plan.md`
const QUALITY = `${ROOT}/evidence/2026-10-07/qg.json`
const REVIEW = `${ROOT}/reviews/review.md`
const CHANGES = `${ROOT}/changes/change-log.md`
const STDOUT = `${ROOT}/evidence/2026-10-07/g1.stdout`
const EXIT = `${ROOT}/evidence/2026-10-07/g1.exit`
const TEMPLATES = { forecast: 'PLAN:{{testPlan}}', outcome: 'GATES:{{gates}}\nREVIEW:{{review}}\nCHANGES:{{changes}}' }
const readTemplate = (path) => TEMPLATES[path.match(/templates\/(\w+)\.md$/)?.[1]]

const data = (overrides = {}) => ({
  kind: 'forecast', story: 'checkout', title: 'Pay by card', revision: REVISION, language: 'en', maxMedia: 0,
  impact: { expected: 'Card payments accepted' }, criteria: [{ id: 'AC-1', description: 'Pay by card', test: 'tests/pay.test.mjs' }],
  limitations: [], media: [], testPlanRef: PLAN, ...overrides,
})
const outcomeData = (overrides = {}) => data({
  kind: 'outcome', impact: { expected: 'Card payments accepted', actual: 'Accepted' },
  qualityEvidenceRef: QUALITY, reviewRef: REVIEW, changeLogRef: CHANGES, testPlanRef: undefined, ...overrides,
})
const quality = () => JSON.stringify({
  $schema: 'quality-gates-evidence/v3', story: 'checkout', produced_at: '2026-10-07T10:00:00Z', producer: 'engineer',
  tech_adapter: 'node', repo_root_rev: REVISION, commits_covered: [], test_integrity: { cycles: [] },
  gates: [{ id: 'G1', label: 'Acceptance', status: 'pass', command_executed: 'node --test', stdout_ref: STDOUT, exit_code_ref: EXIT, stdout_sha256: hashText('ok\n'), stdout_tail: 'ok\n' }],
})
const outcomeFiles = () => new Map([[QUALITY, quality()], [REVIEW, 'Review text'], [CHANGES, 'Change text'], [STDOUT, 'ok\n'], [EXIT, '0\n']])
const reader = (files) => {
  const calls = []
  return { calls, readText: (ref) => { calls.push(ref); return files.get(ref) } }
}
const g1Row = (markdown) => markdown.split('\n').find((line) => line.startsWith('| G1 |'))

test('renderReport: each port is required, with its own message', () => {
  assert.throws(() => renderReport(data(), { readTemplate }), { name: 'TypeError', message: 'readText port is required' })
  assert.throws(() => renderReport(data(), { readText: () => undefined }), { name: 'TypeError', message: 'readTemplate port is required' })
  assert.throws(() => renderReport(outcomeData(), { readText: () => undefined, readTemplate }),
    { name: 'TypeError', message: 'hashText port is required for outcome proofs' })
  // a forecast proves nothing, so it needs no hashText
  assert.equal(renderReport(data(), { readText: () => 'plan', readTemplate }).startsWith('PLAN:'), true)
})

test('renderReport: the template of the kind is read, and a missing one is named', () => {
  const asked = []
  renderReport(data(), { readText: () => 'plan', readTemplate: (path) => { asked.push(path); return 'x' } })
  assert.deepEqual(asked, ['skills/qa-reporting/assets/templates/forecast.md'])
  assert.throws(() => renderReport(data(), { readText: () => 'plan', readTemplate: () => undefined }),
    { name: 'TypeError', message: 'Missing report template: skills/qa-reporting/assets/templates/forecast.md' })
})

test('renderReport: an absent reference is never read, a repeated one is read once', () => {
  const forecast = reader(new Map([[PLAN, 'The plan']]))
  renderReport(data({ testPlanRef: undefined }), { readText: forecast.readText, readTemplate })
  assert.deepEqual(forecast.calls, [])

  const files = outcomeFiles()
  const outcome = reader(files)
  const markdown = renderReport(outcomeData({ changeLogRef: REVIEW }), { readText: outcome.readText, hashText, readTemplate })
  assert.deepEqual(outcome.calls, [QUALITY, REVIEW, STDOUT, EXIT])
  assert.match(markdown, /CHANGES:.*\n\nReview text$/)

  const noReview = reader(outcomeFiles())
  renderReport(outcomeData({ reviewRef: undefined, changeLogRef: undefined }), { readText: noReview.readText, hashText, readTemplate })
  assert.deepEqual(noReview.calls, [QUALITY, STDOUT, EXIT])
})

test('renderReport: a missing file (ENOENT) is a missing document, any other read failure is thrown', () => {
  const enoent = Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' })
  const markdown = renderReport(data(), { readText: () => { throw enoent }, readTemplate })
  assert.match(markdown, /UNVERIFIED: missing or unavailable document/)

  const denied = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
  assert.throws(() => renderReport(data(), { readText: () => { throw denied }, readTemplate }), denied)
  const outcomeDenied = new Error('disk failure')
  assert.throws(() => renderReport(outcomeData(), { readText: () => { throw outcomeDenied }, hashText, readTemplate }), outcomeDenied)
})

test('renderReport: a reader that answers anything but text has no document, and no proof is hashed from it', () => {
  const files = outcomeFiles()
  files.set(STDOUT, Buffer.from('ok\n'))
  const hashed = []
  const markdown = renderReport(outcomeData(), {
    readText: (ref) => files.get(ref),
    hashText: (text) => { hashed.push(typeof text); return hashText(text) },
    readTemplate,
  })
  assert.deepEqual(hashed, ['string'])
  assert.match(g1Row(markdown), /UNVERIFIED/)

  // the proofs as text: the gate passes
  const ok = renderReport(outcomeData(), { readText: (ref) => outcomeFiles().get(ref), hashText, readTemplate })
  assert.match(g1Row(ok), /\| pass \|/)
})
