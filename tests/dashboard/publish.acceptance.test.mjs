// The publication step runs only in CI and writes to a branch several runs
// share. That makes it the easiest place to break something quietly, so it is
// exercised here against a local repository: does it create the branch, does it
// accumulate rather than replace, and does it leave the manifest consistent?
import { ok, strictEqual } from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it } from 'node:test'

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'))

let workspace
let remote

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' })

const publish = (args) =>
  execFileSync(join(repoRoot, 'eng/dashboard/publish.sh'), args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, DATA_REMOTE: remote },
  })

const resultFile = (name, timestamp) => {
  const path = join(workspace, `${name}-results.json`)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(
    path,
    JSON.stringify({
      runner: 'test',
      model: 'claude-sonnet-5',
      timestamp,
      verdicts: [
        {
          subject: { kind: 'skill', name, path: `plugins/skills/${name}` },
          conclusive: true,
          underpowered: false,
          passed: true,
          regressed: false,
          netWin: 1,
          trialCount: 8,
          reason: 'credibly better (8W/0T/0L)',
          signTest: { wins: 8, ties: 0, losses: 0, pValue: 0.008 },
        },
      ],
    }),
  )
  return path
}

/** The evidence branch as it stands on the remote, read from a fresh clone. */
const readBranch = () => {
  const clone = mkdtempSync(join(tmpdir(), 'skraft-publish-read-'))
  git(clone, 'clone', '--branch', 'dashboard-data', '--single-branch', remote, '.')
  return JSON.parse(readFileSync(join(clone, 'data/history.json'), 'utf8'))
}

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'skraft-publish-'))
  remote = join(workspace, 'evidence.git')
  mkdirSync(remote, { recursive: true })
  git(remote, 'init', '--bare', '-q')
})

after(() => rmSync(workspace, { recursive: true, force: true }))

describe('publishing evidence', () => {
  it('creates the evidence branch on the first run', () => {
    publish(['--results', resultFile('outside-in-tdd', '2026-08-01T10:00:00.000Z'), '--run', '1'])

    strictEqual(readBranch().skills['outside-in-tdd'].length, 1)
  })

  it('accumulates a later run instead of replacing the branch', () => {
    publish(['--results', resultFile('adr-eligibility-gate', '2026-08-02T10:00:00.000Z'), '--run', '2'])
    const history = readBranch()

    // The first run's evidence survived: the branch is appended to, never
    // force-replaced. Losing it was a real risk worth pinning down.
    strictEqual(history.skills['outside-in-tdd'].length, 1)
    strictEqual(history.skills['adr-eligibility-gate'].length, 1)
  })

  it('publishes an agent verdict into its own bucket on the same branch', () => {
    const path = join(workspace, 'agent-results.json')
    writeFileSync(
      path,
      JSON.stringify({
        runner: 'skraft-test-harness',
        model: 'claude-sonnet-5',
        timestamp: '2026-08-03T10:00:00.000Z',
        verdicts: [
          {
            subject: { kind: 'agent', name: 'skraft-orchestrator', path: 'plugins/agents/skraft-orchestrator.agent.md' },
            conclusive: true,
            underpowered: false,
            passed: true,
            regressed: false,
            netWin: 1,
            trialCount: 8,
            reason: 'credibly better (8W/0T/0L)',
            signTest: { wins: 8, ties: 0, losses: 0, pValue: 0.008 },
          },
        ],
      }),
    )

    publish(['--results', path, '--run', '3'])
    const history = readBranch()

    strictEqual(history.agents['skraft-orchestrator'].length, 1)
    strictEqual(history.skills['outside-in-tdd'].length, 1)
  })

  it('says so and changes nothing when the same run is republished', () => {
    const output = publish(['--results', join(workspace, 'agent-results.json'), '--run', '3'])

    ok(output.includes('Nothing changed'))
    strictEqual(readBranch().agents['skraft-orchestrator'].length, 1)
  })

  it('refuses to publish when no verdict was produced', () => {
    const output = publish([])

    ok(output.includes('No verdict to publish'))
  })
})
