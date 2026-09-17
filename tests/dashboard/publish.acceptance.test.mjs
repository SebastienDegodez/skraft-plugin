// The publication step runs only in CI and writes to a branch several runs
// share. That makes it the easiest place to break something quietly, so it is
// exercised here against a local repository: does it create the branch, does it
// accumulate rather than replace, and does it leave the manifest consistent?
import { ok, strictEqual, throws } from 'node:assert/strict'
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

const writeResult = (path, name, timestamp) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(
    path,
    JSON.stringify({
      runner: 'test',
      model: 'claude-sonnet-5',
      timestamp,
      verdicts: [
        {
          subject: { kind: 'skill', name, path: `plugins/skraft-framework/skills/${name}` },
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

const resultFile = (name, timestamp) => writeResult(join(workspace, `${name}-results.json`), name, timestamp)

const replayFixture = (name) => {
  const root = join(workspace, `${name}-replay`)
  const result = writeResult(join(root, name, 'results.json'), name, '2026-08-05T10:00:00.000Z')
  for (const arm of ['baseline', 'skilled']) {
    const trial = join(root, name, arm, '2026-08-05T10-00-00-000Z', name, 'drive-the-demo', 'claude-sonnet-5', '0')
    mkdirSync(trial, { recursive: true })
    writeFileSync(
      join(trial, 'metadata.json'),
      JSON.stringify({
        evalFilePath: `tests/skills/${name}/eval.yaml`,
        variant: 'main',
        stimulusName: 'Drive the demo',
        trialIndex: 0,
      }),
    )
    writeFileSync(join(trial, 'events.jsonl'), `{"type":"${arm}"}\n`)
  }
  return { result, root }
}

/** The evidence branch as it stands on the remote, read from a fresh clone. */
const readBranch = () => {
  const clone = mkdtempSync(join(tmpdir(), 'skraft-publish-read-'))
  git(clone, 'clone', '--branch', 'dashboard-data', '--single-branch', remote, '.')
  return JSON.parse(readFileSync(join(clone, 'data/history.json'), 'utf8'))
}

const readManifest = () => {
  const clone = mkdtempSync(join(tmpdir(), 'skraft-replay-read-'))
  git(clone, 'clone', '--branch', 'dashboard-data', '--single-branch', remote, '.')
  return JSON.parse(readFileSync(join(clone, 'data/manifest.json'), 'utf8'))
}

const branchTip = () => git(workspace, 'ls-remote', remote, 'refs/heads/dashboard-data').split(/\s/)[0]

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
            subject: { kind: 'agent', name: 'skraft-orchestrator', path: 'plugins/skraft-framework/com.github.copilot/agents/skraft-orchestrator.agent.md' },
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

  it('publishes Vally 0.12 trajectories with their verdict', () => {
    const fixture = replayFixture('replay-first')
    publish([
      '--results',
      fixture.result,
      '--replay-from',
      fixture.root,
      '--source',
      'pr',
      '--pr-number',
      '41',
      '--run',
      '41',
    ])

    const sessions = readManifest().sessions
    strictEqual(sessions.length, 2)
    ok(sessions.some((session) => session.tags.includes('baseline')))
    ok(sessions.some((session) => session.tags.includes('skilled')))
    ok(sessions.every((session) => session.url.startsWith('sessions/pr/41/replay-first/')))
  })

  it('preserves earlier replay sessions when another PR publishes', () => {
    const fixture = replayFixture('replay-second')
    publish([
      '--results',
      fixture.result,
      '--replay-from',
      fixture.root,
      '--source',
      'pr',
      '--pr-number',
      '42',
      '--run',
      '42',
    ])

    const sessions = readManifest().sessions
    strictEqual(sessions.length, 4)
    ok(sessions.some((session) => session.url.startsWith('sessions/pr/41/')))
    ok(sessions.some((session) => session.url.startsWith('sessions/pr/42/')))
  })

  it('fails atomically when verdicts have no replay trajectories', () => {
    const emptyReplay = join(workspace, 'empty-replay')
    mkdirSync(emptyReplay, { recursive: true })
    const result = writeResult(join(emptyReplay, 'missing-replay', 'results.json'), 'missing-replay', '2026-08-06T10:00:00.000Z')
    const before = branchTip()

    throws(() =>
      publish([
        '--results',
        result,
        '--replay-from',
        emptyReplay,
        '--run',
        '43',
      ]),
    )
    strictEqual(branchTip(), before)
    strictEqual(readBranch().skills['missing-replay'], undefined)
  })

  it('rejects a batch when any verdict file lacks trajectories', () => {
    const covered = replayFixture('covered-replay')
    const missing = writeResult(join(covered.root, 'uncovered-replay', 'results.json'), 'uncovered-replay', '2026-08-07T10:00:00.000Z')
    const before = branchTip()

    throws(() =>
      publish([
        '--results',
        covered.result,
        '--results',
        missing,
        '--replay-from',
        covered.root,
        '--run',
        '44',
      ]),
    )
    strictEqual(branchTip(), before)
    strictEqual(readBranch().skills['covered-replay'], undefined)
    strictEqual(readBranch().skills['uncovered-replay'], undefined)
  })

  it('drops closed-PR trajectories without deleting verdict history', () => {
    publish(['--drop-pr', '41'])

    const sessions = readManifest().sessions
    strictEqual(sessions.length, 2)
    ok(sessions.every((session) => session.url.startsWith('sessions/pr/42/')))
    strictEqual(readBranch().skills['replay-first'].length, 1)
  })
})

describe('compacting the evidence branch', () => {
  const compact = (args) =>
    execFileSync(join(repoRoot, 'eng/dashboard/compact-data-branch.sh'), args, {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, DATA_REMOTE: remote },
    })

  /** The branch tip and how many commits lead to it, read from the remote. */
  const branchState = () => {
    const clone = mkdtempSync(join(tmpdir(), 'skraft-compact-read-'))
    git(clone, 'clone', '--branch', 'dashboard-data', '--single-branch', remote, '.')
    return {
      commits: Number(git(clone, 'rev-list', '--count', 'HEAD').trim()),
      tree: git(clone, 'rev-parse', 'HEAD^{tree}').trim(),
    }
  }

  it('leaves a young history alone', () => {
    const before = branchState()
    const output = compact([])

    ok(output.includes('nothing to compact'))
    strictEqual(branchState().commits, before.commits)
  })

  it('keeps the published tree byte for byte while dropping the history', () => {
    const before = branchState()
    ok(before.commits > 1, 'the earlier publications should have built up a history')

    compact(['--max-commits', '1', '--max-megabytes', '0'])
    const after = branchState()

    strictEqual(after.commits, 1)
    // The whole point: readers see exactly the same files afterwards.
    strictEqual(after.tree, before.tree)
  })

  it('reports what it would do without touching the branch', () => {
    const before = branchState()
    const output = compact(['--max-commits', '0', '--max-megabytes', '0', '--dry-run'])

    ok(output.includes('Dry run'))
    strictEqual(branchState().tree, before.tree)
    strictEqual(branchState().commits, before.commits)
  })

  it('does nothing when the branch does not exist yet', () => {
    const empty = join(workspace, 'empty.git')
    mkdirSync(empty, { recursive: true })
    git(empty, 'init', '--bare', '-q')
    const output = execFileSync(join(repoRoot, 'eng/dashboard/compact-data-branch.sh'), [], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, DATA_REMOTE: empty },
    })

    ok(output.includes('does not exist'))
  })
})
