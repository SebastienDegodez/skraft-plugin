import { ok, strictEqual } from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it } from 'node:test'

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'))

const verdict = (name, overrides = {}) => ({
  subject: { kind: 'skill', name },
  conclusive: true,
  underpowered: false,
  passed: true,
  regressed: false,
  reason: 'measured',
  ...overrides,
})

describe('PR verdict CLIs with cells reused from an earlier evaluation', () => {
  let workspace
  const node = (script, ...args) => spawnSync(process.execPath, [join(repoRoot, script), ...args], { cwd: workspace, encoding: 'utf8' })
  const cell = (dir, result) => {
    mkdirSync(join(workspace, dir), { recursive: true })
    writeFileSync(join(workspace, dir, 'results.json'), JSON.stringify(result))
  }

  before(() => {
    workspace = mkdtempSync(join(tmpdir(), 'pr-verdict-'))
    cell('eval-results/bdd-methodology', { verdicts: [verdict('bdd-methodology')] })
    cell('eval-plan/reused/skill-outside-in-tdd', {
      verdicts: [verdict('outside-in-tdd', { passed: false, regressed: true })],
      reuse: { measuredSha: 'aaaaaaa1', headSha: 'bbbbbbb1', runId: '101', runUrl: 'https://example.test/runs/101' },
    })
  })

  after(() => rmSync(workspace, { recursive: true, force: true }))

  it('renders fresh and reused rows in one comment', () => {
    const result = node('eng/build-pr-comment.mjs', '--results-dir', 'eval-results', '--reused-dir', 'eval-plan/reused')
    strictEqual(result.status, 0, result.stderr)
    ok(result.stdout.includes('| bdd-methodology | ✅ pass |'), result.stdout)
    ok(result.stdout.includes('| outside-in-tdd | 🔴 regression · reused |'), result.stdout)
  })

  it('blocks the merge on a reused regression', () => {
    strictEqual(node('eng/check-pr-regressions.mjs', '--results-dir', 'eval-results').status, 0)
    strictEqual(node('eng/check-pr-regressions.mjs', '--results-dir', 'eval-results', '--reused-dir', 'eval-plan/reused').status, 1)
  })

  it('treats a missing reused directory as no reused cell', () => {
    const result = node('eng/check-pr-regressions.mjs', '--results-dir', 'eval-results', '--reused-dir', 'no-such-dir')
    strictEqual(result.status, 0, result.stderr)
  })
})
