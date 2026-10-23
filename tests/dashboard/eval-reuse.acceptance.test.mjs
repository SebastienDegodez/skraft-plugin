import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it } from 'node:test'

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'))
const CLI = join(repoRoot, 'eng/eval-reuse.mjs')

const ENV = {
  VALLY_PACKAGE: '@microsoft/vally-cli@0.12.0',
  COPILOT_SDK_PACKAGE: '@github/copilot-sdk@1.0.9',
  COPILOT_CLI_PACKAGE: '@github/copilot@1.0.78',
  JUDGE_MODEL: 'gpt-5.6-luna',
  MODEL: '',
}

const cell = (kind, name) => ({
  kind,
  name,
  args: `${kind === 'skill' ? 'skills' : 'agents'} ${name}`,
  artifact: `eval-part-${kind}-${name}`,
})

const MATRIX = { include: [cell('skill', 'bdd-methodology'), cell('skill', 'outside-in-tdd'), cell('agent', 'commit-convention')] }

const passing = (kind, name) => ({
  runner: 'vally',
  verdicts: [{ subject: { kind, name }, conclusive: true, underpowered: false, passed: true, reason: 'credibly better' }],
})

describe('eval-reuse CLI on a pull request pushed twice', () => {
  let workspace
  let repo

  const write = (path, content) => {
    mkdirSync(dirname(join(repo, path)), { recursive: true })
    writeFileSync(join(repo, path), content)
  }
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' })
    strictEqual(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  const commit = (message) => {
    git('add', '-A')
    git('-c', 'user.name=t', '-c', 'user.email=t@example.test', 'commit', '-q', '-m', message)
    return git('rev-parse', 'HEAD')
  }
  const cli = (...args) => {
    const result = spawnSync(process.execPath, [CLI, ...args], { cwd: repo, encoding: 'utf8', env: { ...process.env, ...ENV } })
    strictEqual(result.status, 0, result.stderr)
    return result
  }
  const readJson = (path) => JSON.parse(readFileSync(join(workspace, path), 'utf8'))
  const planPush = (name, previous, ...extra) => {
    writeFileSync(join(workspace, 'matrix.json'), JSON.stringify(MATRIX))
    const args = ['plan', '--matrix', join(workspace, 'matrix.json'), '--out-dir', join(workspace, name)]
    if (previous) args.push('--previous', join(workspace, previous))
    args.push(...extra)
    return JSON.parse(cli(...args).stdout)
  }
  const recordPush = (planDir, resultsDir, ledgerDir, run) =>
    cli(
      'record',
      '--plan', join(workspace, planDir),
      '--results-dir', join(workspace, resultsDir),
      '--out-dir', join(workspace, ledgerDir),
      '--measured-sha', run.sha,
      '--head-sha', run.sha,
      '--run-id', run.id,
      '--run-url', `https://example.test/runs/${run.id}`
    )
  const measured = (resultsDir, kind, name) => {
    mkdirSync(join(workspace, resultsDir, name), { recursive: true })
    writeFileSync(join(workspace, resultsDir, name, 'results.json'), JSON.stringify(passing(kind, name)))
  }

  let first
  let second

  before(() => {
    workspace = mkdtempSync(join(tmpdir(), 'eval-reuse-'))
    repo = join(workspace, 'repo')
    mkdirSync(repo)
    git('init', '-q')
    write('plugins/skraft-framework/skills/outside-in-tdd/SKILL.md', 'outside-in v1\n')
    write('plugins/skraft-framework/skills/bdd-methodology/SKILL.md', 'bdd v1\n')
    write('plugins/skraft-framework/skills/craft-discipline/SKILL.md', 'craft v1\n')
    write('plugins/skraft-framework/com.github.copilot/agents/software-engineer.agent.md', 'agent v1\n')
    write('plugins/skraft-framework/engine/application/config.mjs', 'config v1\n')
    write('tests/skills/outside-in-tdd/eval.yaml', 'name: outside-in\n')
    write('tests/skills/outside-in-tdd/eval.skill-dir.yaml', 'skills:\n  - craft-discipline\n')
    write('tests/skills/bdd-methodology/eval.yaml', 'name: bdd\n')
    write(
      'tests/agents/commit-convention/eval.yaml',
      ['name: commits', 'stimuli:', '  - name: one', '    environment:', '      files:', '        - src: ../../../scripts/tool.mjs', '          dest: tool.mjs', ''].join('\n')
    )
    write('scripts/tool.mjs', 'tool v1\n')
    write('scripts/unrelated.mjs', 'unrelated v1\n')
    write('eng/run-vally-evals.sh', 'runner v1\n')
    first = { sha: commit('first push'), id: '101' }

    // First push: nothing to reuse, every subject runs and is recorded.
    planPush('plan-1')
    for (const { kind, name } of MATRIX.include) measured('results-1', kind, name)
    recordPush('plan-1', 'results-1', 'ledger-1', first)

    // Second push touches configuration code and one eval spec only.
    write('plugins/skraft-framework/engine/application/config.mjs', 'config v2\n')
    write('tests/skills/bdd-methodology/eval.yaml', 'name: bdd, sharper\n')
    second = { sha: commit('second push'), id: '202' }
  })

  after(() => rmSync(workspace, { recursive: true, force: true }))

  it('runs every subject when the PR has no earlier evaluation', () => {
    strictEqual(readJson('plan-1/plan.json').reused.length, 0)
    deepStrictEqual(Object.keys(readJson('ledger-1/ledger.json').subjects).sort(), [
      'agent:commit-convention',
      'skill:bdd-methodology',
      'skill:outside-in-tdd',
    ])
  })

  it('runs only the subject the new push changed and carries the others from the run that measured them', () => {
    const { include } = planPush('plan-2', 'ledger-1')
    deepStrictEqual(include, [cell('skill', 'bdd-methodology')])

    const reused = readJson('plan-2/reused/skill-outside-in-tdd/results.json')
    const { measuredAt, ...measuredBy } = reused.reuse
    deepStrictEqual(measuredBy, { measuredSha: first.sha, headSha: first.sha, runId: '101', runUrl: 'https://example.test/runs/101' })
    ok(Date.now() - Date.parse(measuredAt) < 60_000, measuredAt)
    deepStrictEqual(reused.verdicts, passing('skill', 'outside-in-tdd').verdicts)
    ok(existsSync(join(workspace, 'plan-2/reused/agent-commit-convention/results.json')))
    ok(!existsSync(join(workspace, 'plan-2/reused/skill-bdd-methodology')))
  })

  it('leaves a ledger that keeps the first measurement of a reused cell and the new one of the re-run cell', () => {
    measured('results-2', 'skill', 'bdd-methodology')
    recordPush('plan-2', 'results-2', 'ledger-2', second)
    const { subjects } = readJson('ledger-2/ledger.json')
    strictEqual(subjects['skill:outside-in-tdd'].measuredSha, first.sha)
    strictEqual(subjects['agent:commit-convention'].runId, '101')
    strictEqual(subjects['skill:bdd-methodology'].measuredSha, second.sha)
    strictEqual(subjects['skill:bdd-methodology'].fingerprint, readJson('plan-2/plan.json').planned[0].fingerprint)
    deepStrictEqual(readJson('ledger-2/cells/skill-bdd-methodology/results.json'), passing('skill', 'bdd-methodology'))

    // Third push changes nothing the evaluations read: all three carry over.
    deepStrictEqual(planPush('plan-3', 'ledger-2').include, [])
  })

  it('runs a subject whose earlier cell cannot be read', () => {
    writeFileSync(join(workspace, 'ledger-1/cells/skill-outside-in-tdd/results.json'), '{ not json')
    deepStrictEqual(planPush('plan-4', 'ledger-1').include.map(({ name }) => name), ['bdd-methodology', 'outside-in-tdd'])
  })

  it('runs everything on a re-run of the workflow, even with nothing changed', () => {
    deepStrictEqual(planPush('plan-rerun', 'ledger-2', '--attempt', '2').include, MATRIX.include)
    deepStrictEqual(planPush('plan-first-attempt', 'ledger-2', '--attempt', '1').include, [])
  })

  it('runs everything when the earlier ledger is missing', () => {
    deepStrictEqual(planPush('plan-5', 'no-such-ledger').include, MATRIX.include)
  })

  it('runs a suite again when a file its spec stages from outside its folder changes', () => {
    write('scripts/unrelated.mjs', 'unrelated v2\n')
    commit('unrelated script push')
    deepStrictEqual(planPush('plan-7', 'ledger-2').include, [])
    write('scripts/tool.mjs', 'tool v2\n')
    commit('staged script push')
    deepStrictEqual(planPush('plan-8', 'ledger-2').include, [cell('agent', 'commit-convention')])
  })

  it('runs a skill again when a companion skill it mounts changes, and the agent suites that can load it', () => {
    write('plugins/skraft-framework/skills/craft-discipline/SKILL.md', 'craft v2\n')
    commit('companion push')
    deepStrictEqual(planPush('plan-6', 'ledger-2').include, [cell('skill', 'outside-in-tdd'), cell('agent', 'commit-convention')])
  })
})
