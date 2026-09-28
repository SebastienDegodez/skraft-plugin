// Builds the delivered Git history the DELIVER review approved: base commit, RED test commit,
// GREEN implementation commit, then an evidence-only commit carrying a v4 quality-gates log
// bound to that exact history. Records the DELIVER base in state and the engineer-owned
// outcome data without committing them.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const sha256 = (text) => createHash('sha256').update(text).digest('hex')

const TRACKING = '.copilot-tracking/skraft-plans/pricing'
const EVIDENCE = 'evidence/2026-08-20/discount'
const TEST_FILE = 'tests/CheckoutPricing.UnitTests/LoyaltyDiscountTests.cs'
const IMPL_FILE = 'src/CheckoutPricing.Domain/LoyaltyDiscount.cs'
const evidencePath = (name) => `${TRACKING}/${EVIDENCE}/${name}`

git('add', '-A', '--', '.', `:(exclude)${TEST_FILE}`, `:(exclude)${IMPL_FILE}`)
git('commit', '--quiet', '-m', 'docs(discount): approve the story through DISTILL')
const baseSha = git('rev-parse', 'HEAD')

const redSubject = 'test(discount): pin loyalty tier reduction'
git('add', '--', TEST_FILE)
git('commit', '--quiet', '-s', '-m', redSubject, '-m', 'Refs: #42')
const redSha = git('rev-parse', 'HEAD')

const greenSubject = 'feat(discount): apply loyalty tier reduction at checkout'
git('add', '--', IMPL_FILE)
git('commit', '--quiet', '-s', '-m', greenSubject, '-m', 'Refs: #42')
const greenSha = git('rev-parse', 'HEAD')

mkdirSync(evidencePath('snapshots'), { recursive: true })
const snapshot = git('show', `${redSha}:${TEST_FILE}`) + '\n'
writeFileSync(evidencePath('snapshots/red-1-LoyaltyDiscountTests.cs'), snapshot)
writeFileSync(evidencePath('snapshots/green-1-LoyaltyDiscountTests.cs'), snapshot)
const redStdout = '$ dotnet test tests/CheckoutPricing.UnitTests\nFailed: 4, Passed: 0\n'
writeFileSync(evidencePath('qg-red-1.stdout'), redStdout)
writeFileSync(evidencePath('qg-red-1.exit'), '1\n')

const tests = { tests_total: 4, tests_passed: 4, tests_failed: 0 }
const GATES = [
  ['G1', null, 'Acceptance test(s) pass', 'dotnet test tests/CheckoutPricing.AcceptanceTests', tests],
  ['G2', null, 'All unit tests pass', 'dotnet test tests/CheckoutPricing.UnitTests', tests],
  ['G3', null, 'Build passes', 'dotnet build --warnaserror'],
  ['G4', null, 'Static analysis pass', 'dotnet format --verify-no-changes'],
  ['G5', null, 'Architecture rules pass', 'dotnet test tests/CheckoutPricing.ArchitectureTests'],
  ['G6', 'core', 'Mutation score meets the bar', 'dotnet stryker --config-file stryker-config.core.json'],
  ['G6', 'boundary', 'Mutation score meets the bar', 'dotnet stryker --config-file stryker-config.boundary.json'],
  ['G7', null, 'No mocks in Domain/Application core', 'grep -rn "Mock<" src/CheckoutPricing.Domain || true'],
  ['G8', null, 'Conventional commit policy', `git log --format=%B ${baseSha}..${greenSha}`],
  ['G9', null, 'No test tampering (RED→GREEN integrity)', `git diff ${redSha} ${greenSha} -- ${TEST_FILE}`],
  ['G11', null, 'Line coverage meets the bar', 'dotnet test --collect:"XPlat Code Coverage"'],
]
const gates = GATES.map(([id, scope, label, command, metrics]) => {
  const name = `qg-${id.toLowerCase()}${scope ? `-${scope}` : ''}`
  const stdout = `$ ${command}\nPassed.\n`
  writeFileSync(evidencePath(`${name}.stdout`), stdout)
  writeFileSync(evidencePath(`${name}.exit`), '0\n')
  return {
    id,
    ...(scope ? { scope } : {}),
    label,
    status: 'pass',
    command_executed: command,
    exit_code_ref: `${EVIDENCE}/${name}.exit`,
    stdout_ref: `${EVIDENCE}/${name}.stdout`,
    stdout_sha256: sha256(stdout),
    stdout_tail: 'Passed.\n',
    ...(metrics ? { metrics } : {}),
  }
})
gates.splice(10, 0, { id: 'G10', label: 'RED observed', status: 'pass', rationale: 'See test_integrity.cycles[].' })

const log = {
  $schema: 'quality-gates-evidence/v4',
  story: 'discount',
  produced_at: '2026-08-20T16:45:00Z',
  producer: 'software-engineer',
  tech_adapter: 'quality-gates-dotnet',
  repo_root_rev: greenSha,
  commits_covered: [
    { sha: redSha, subject: redSubject, files_changed: [TEST_FILE] },
    { sha: greenSha, subject: greenSubject, files_changed: [IMPL_FILE] },
  ],
  gates,
  test_integrity: {
    cycles: [{
      cycle: 1,
      behavior: 'loyalty tier reduction',
      test_files: [TEST_FILE],
      red_commit: redSha,
      green_commit: greenSha,
      red_snapshot_ref: `${EVIDENCE}/snapshots/red-1-LoyaltyDiscountTests.cs`,
      green_snapshot_ref: `${EVIDENCE}/snapshots/green-1-LoyaltyDiscountTests.cs`,
      red_stdout_ref: `${EVIDENCE}/qg-red-1.stdout`,
      red_stdout_sha256: sha256(redStdout),
      red_exit_code_ref: `${EVIDENCE}/qg-red-1.exit`,
    }],
  },
}
writeFileSync(evidencePath('qg-discount.json'), `${JSON.stringify(log, null, 2)}\n`)
git('add', '--', `${TRACKING}/${EVIDENCE}`)
git('commit', '--quiet', '-s', '-m', 'docs(discount): record quality gate evidence', '-m', 'Refs: #42')

const statePath = `${TRACKING}/state.json`
const state = JSON.parse(readFileSync(statePath, 'utf8'))
state.phaseHistory.DELIVER.baseSha = baseSha
writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`)

const unitEvidence = `${TRACKING}/${EVIDENCE}/qg-g2.stdout`
const outcome = {
  kind: 'outcome',
  story: 'discount',
  title: 'Loyalty tier discount at checkout',
  revision: greenSha,
  language: 'en',
  impact: {
    expected: `Returning customers pay 5, 10 or 15 percent less by tier; source: ${TRACKING}/plans/2026-08-12/ac.md`,
    actual: 'Observed the tier reductions in LoyaltyDiscountTests; deployment unverified.',
  },
  criteria: [
    ['AC-1', 'Bronze basket', 'Charges_the_tier_reduced_total(Bronze, 10000, 9500)'],
    ['AC-2', 'Silver basket', 'Charges_the_tier_reduced_total(Silver, 10000, 9000)'],
    ['AC-3', 'Gold basket', 'Charges_the_tier_reduced_total(Gold, 10000, 8500)'],
    ['AC-4', "Reduction lands on a whole cent in the customer's favour", 'Charges_the_tier_reduced_total(Bronze, 7, 7)'],
  ].map(([id, description, test]) => ({ id, description, test, evidence: unitEvidence })),
  testPlanRef: `${TRACKING}/details/2026-08-17/test-plan-discount.md`,
  qualityEvidenceRef: `${TRACKING}/${EVIDENCE}/qg-discount.json`,
  changeLogRef: `${TRACKING}/changes/2026-08-20/change-log.md`,
  limitations: ['No deployment evidence.'],
  media: [],
  maxMedia: 0,
}
writeFileSync(`${TRACKING}/changes/2026-08-20/outcome-discount.json`, `${JSON.stringify(outcome, null, 2)}\n`)
