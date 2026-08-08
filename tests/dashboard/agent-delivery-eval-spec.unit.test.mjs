import { deepStrictEqual, match, strictEqual } from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import { loadEvalSpec } from '@microsoft/vally'

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'))
const suiteRoot = join(repoRoot, 'tests/agents/software-engineer-delivery')
const specPath = join(suiteRoot, 'eval.yaml')
const fixtureRoot = join(suiteRoot, 'fixtures/approved-loyalty-discount-red')

describe('Software Engineer delivery eval spec', () => {
  it('uses a separate Sonnet-class two-turn suite with bounded write access', async () => {
    const spec = await loadEvalSpec(specPath)

    strictEqual(spec.defaults.executor, 'skraft-agent-runner')
    strictEqual(spec.defaults.model, 'claude-sonnet-4.6')
    strictEqual(spec.defaults.runs, 1)
    strictEqual(spec.stimuli.length, 1)

    const stimulus = spec.stimuli[0]
    strictEqual(stimulus.turns.length, 2)
    strictEqual(stimulus.tags.agent, 'software-engineer')
    strictEqual(stimulus.tags.permissions, 'workspace-write')
    strictEqual(stimulus.constraints.max_turns, 2)
    strictEqual(/(?:outside-in-tdd|red-synthesize-green|craft-discipline)/i.test(stimulus.prompt), false)
    deepStrictEqual(stimulus.supported_executors, ['skraft-agent-runner'])
    strictEqual(
      stimulus.environment.files.every(({ src }) => src.startsWith('fixtures/approved-loyalty-discount-red/')),
      true,
    )

    const graderTypes = stimulus.graders.map(({ type }) => type)
    deepStrictEqual(graderTypes, [
      'completed',
      'output-matches',
      'run-command',
      'run-command',
      'run-command',
      'diff-contains',
      'diff-not-contains',
      'diff-contains',
      'skill-invocation',
      'file-exists',
      'file-contains',
      'output-not-matches',
    ])
    deepStrictEqual(stimulus.graders[8].config.required, [
      'outside-in-tdd',
      'craft-discipline',
      'red-synthesize-green',
      'clean-architecture-testing',
      'mutation-testing',
      'quality-gates-evidence-contract',
      'quality-gates-dotnet',
    ])
    strictEqual(
      stimulus.graders[6].config.pattern,
      '(?m)^diff --git a/tests/CheckoutPricing\\.UnitTest/LoyaltyDiscount/CalculateLoyaltyDiscountAcceptanceTests\\.cs ',
    )
  })

  it('starts from a compiling outer test that fails only on business behavior', () => {
    const env = { ...process.env }
    delete env.NODE_TEST_CONTEXT
    const workDir = mkdtempSync(join(tmpdir(), 'checkout-pricing-fixture-'))

    try {
      cpSync(fixtureRoot, workDir, { recursive: true })
      const restore = spawnSync('dotnet', ['restore', 'CheckoutPricing.slnx'], { cwd: workDir, encoding: 'utf8', env })
      strictEqual(restore.status, 0, `${restore.stdout}\n${restore.stderr}`)
      const run = spawnSync(
        'dotnet',
        ['test', 'CheckoutPricing.slnx', '--no-restore'],
        { cwd: workDir, encoding: 'utf8', env },
      )
      const output = `${run.stdout}\n${run.stderr}`

      strictEqual(run.status, 1)
      match(output, /MemberReceivesApprovedDiscountOnCartSubtotal/)
      match(output, /Assert\.Equal\(\) Failure|Expected:/)
      strictEqual(/CS\d{4}|Build FAILED/.test(output), false)
    } finally {
      rmSync(workDir, { recursive: true, force: true })
    }
  })
})
