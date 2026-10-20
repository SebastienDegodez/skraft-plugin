import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs, reportMarkdown, runProbe, toolText } from '../../../eng/host-probe/copilot-probe.mjs'
import { planIssueActions } from '../../../eng/host-probe/issues.mjs'
import { simulatedSdk } from './simulated-copilot-host.mjs'

const FAST = { tools: 50, isolationTools: 50, poll: 10, settle: 0 }
const ENVIRONMENT = { copilot: '1.0.100', sdk: 'test', node: 'v22', os: 'linux' }

const probe = async (t, host) => {
  const workRoot = await mkdtemp(join(tmpdir(), 'skraft-host-probe-test-'))
  t.after(() => rm(workRoot, { recursive: true, force: true }))
  const report = await runProbe({ sdk: simulatedSdk(host), environment: ENVIRONMENT, workRoot, timings: FAST })
  return { report, verdicts: Object.fromEntries(report.checks.map((item) => [item.id, item.verdict])) }
}

test('on a host that behaves as the issues say, every premise is measured and every requirement passes', async (t) => {
  const { report, verdicts } = await probe(t)

  assert.deepEqual(verdicts, {
    'extension-loads-agent-plugins': 'pass',
    'extension-loads-claude-plugin': 'pass',
    'cwd-after-cd': 'pass',
    'confirm-from-tool': 'pass',
    'confirm-in-autopilot': 'pass',
    'confirm-from-workflow': 'pass',
    'throwing-workflow': 'pass',
    'broken-workflow-isolation': 'pass',
    'bad-tool-name-isolation': 'pass',
    'skraft-extension-loaded': 'pass',
    'skraft-workflow-registered': 'pass',
    'unknown-arg-ignored': 'pass',
    'decide-without-confirm': 'pass',
    'decide-after-cd': 'pass',
    'session-agents': 'pass',
    'copilot-models-available': 'pass',
  })
  const decided = report.checks.find((item) => item.id === 'decide-without-confirm')
  assert.deepEqual(decided.observed.answeredBy, ['decide'])
  assert.equal(decided.observed.hostAsked, 0)
})

test('a conclusive check linked to an issue becomes a comment on it, and opens nothing', async (t) => {
  const { report } = await probe(t)
  const actions = planIssueActions(report, { openTitles: new Set() })

  assert.deepEqual([...new Set(actions.map((action) => action.kind))], ['comment'])
  assert.deepEqual([...new Set(actions.map((action) => action.issue))].sort(), [244, 245, 246, 247, 249])
  assert.match(actions.find((action) => action.check === 'decide-without-confirm').body, /mesuré conforme/)
  assert.match(actions[0].body, /Copilot CLI 1\.0\.100/)
})

test('a failed requirement opens one issue, unless an open issue already has its title', async (t) => {
  const { report, verdicts } = await probe(t, { skraftLoads: false, models: ['claude-sonnet-5.5'] })

  assert.equal(verdicts['skraft-extension-loaded'], 'fail')
  assert.equal(verdicts['skraft-workflow-registered'], 'fail')
  assert.equal(verdicts['copilot-models-available'], 'fail')
  assert.equal(verdicts['decide-without-confirm'], undefined)
  const models = report.checks.find((item) => item.id === 'copilot-models-available')
  assert.ok(models.observed.missing.includes('haiku: claude-haiku-5.5'))

  const opened = planIssueActions(report, { openTitles: new Set() }).filter((action) => action.kind === 'open')
  assert.deepEqual(opened.map((action) => action.check), ['skraft-extension-loaded', 'skraft-workflow-registered', 'copilot-models-available'])
  assert.match(opened[0].body, /Mesure\*\* \(`skraft-extension-loaded`/)

  const known = new Set([opened[0].title])
  assert.deepEqual(planIssueActions(report, { openTitles: known }).filter((action) => action.kind === 'open').map((action) => action.check), ['skraft-workflow-registered', 'copilot-models-available'])
})

test('an inconclusive check reaches no issue', () => {
  const report = { environment: ENVIRONMENT, checks: [{ id: 'cwd-after-cd', issue: 245, verdict: 'inconclusive', expected: 'x', observed: {} }, { id: 'r', verdict: 'inconclusive', title: 'T', expected: 'x', observed: {} }] }
  assert.deepEqual(planIssueActions(report, { openTitles: new Set() }), [])
})

test('the Markdown report lists each check with its issue and escapes table pipes', () => {
  const text = reportMarkdown({ date: '2026-10-20T10:00:00Z', environment: ENVIRONMENT, checks: [{ id: 'cwd-after-cd', issue: 245, verdict: 'pass', observed: { a: 'x|y' } }, { id: 'session-agents', verdict: 'fail', observed: {} }] })
  assert.match(text, /\| `cwd-after-cd` \| #245 \| pass \| \{"a":"x\\\|y"\} \|/)
  assert.match(text, /\| `session-agents` \| — \| fail \|/)
})

test('the command line takes known options only', () => {
  assert.deepEqual(parseArgs(['--report-issues', '--dry-run', '--out', 'r']), { sdk: null, copilot: null, out: 'r', reportIssues: true, dryRun: true, repo: 'SebastienDegodez/skraft-plugin', keep: false })
  assert.throws(() => parseArgs(['--bogus']), /usage/)
  assert.throws(() => parseArgs(['--sdk']), /usage/)
})

test('a tool result is read from a string or from an expanded result', () => {
  assert.equal(toolText('plain'), 'plain')
  assert.equal(toolText({ textResultForLlm: 'expanded', resultType: 'success' }), 'expanded')
  assert.equal(toolText(undefined), '')
})
