import { deepStrictEqual, match, strictEqual } from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { parse } from 'yaml'
import { stimulusKeys, store } from '../../eng/lib/baseline-cache.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const source = `name: synthetic-runner
type: capability
defaults:
  model: pinned-test-model
  runs: 3
stimuli:
  - name: Definition
    prompt: &prompt Preserve the observable result.
    environment: &environment
      files:
        - src: ./fixtures/input.txt
          dest: input.txt
  - name: Consumer
    prompt: *prompt
    environment: *environment
`

function fixture(t) {
  const workspace = mkdtempSync(join(tmpdir(), 'skraft-runner-options-'))
  t.after(() => rmSync(workspace, { recursive: true, force: true }))
  // Copy tooling only: no test reads a shipped eval spec or target skill.
  cpSync(join(root, 'eng'), join(workspace, 'eng'), { recursive: true })
  symlinkSync(join(root, 'node_modules'), join(workspace, 'node_modules'), 'dir')
  const spec = join(workspace, 'tests/skills/synthetic-runner/eval.yaml')
  mkdirSync(join(dirname(spec), 'fixtures'), { recursive: true })
  writeFileSync(spec, source)
  writeFileSync(join(dirname(spec), 'fixtures/input.txt'), 'synthetic fixture')
  const skill = join(workspace, 'plugins/skraft-framework/skills/synthetic-runner')
  mkdirSync(skill, { recursive: true })
  writeFileSync(join(skill, 'SKILL.md'), '# Synthetic skill\n')
  const calls = join(workspace, 'calls.jsonl')
  const fake = join(workspace, 'fake-vally.mjs')
  writeFileSync(fake, `import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parse } from 'yaml'
const args = process.argv.slice(2)
const value = (flag) => args[args.indexOf(flag) + 1]
const call = { args }
if (args[0] === 'eval') {
  call.spec = parse(readFileSync(value('--eval-spec'), 'utf8'))
  call.fixtures = call.spec.stimuli.flatMap((stimulus) =>
    (stimulus.environment?.files ?? []).map(({ src }) =>
      readFileSync(resolve(dirname(value('--eval-spec')), src), 'utf8')))
  const output = join(value('--output-dir'), 'run')
  mkdirSync(output, { recursive: true })
  writeFileSync(join(output, 'results.jsonl'), call.spec.stimuli.map(({ name }) => JSON.stringify({
    type: 'trial-result', status: 'success', stimulus: name, trialIndex: 0,
    gradeResult: { passed: true, score: 1 }
  })).join('\\n') + '\\n')
} else if (args[0] === 'compare') {
  writeFileSync(value('--output'), JSON.stringify({
    summary: { wins: 0, ties: 1, losses: 0, trialCount: 1, erroredCount: 0 }, stimuli: []
  }) + '\\n')
}
appendFileSync(process.env.FAKE_CALLS, JSON.stringify(call) + '\\n')
`)
  const env = {
    ...process.env,
    VALLY: `${process.execPath} ${fake}`,
    FAKE_CALLS: calls,
    COPILOT_GITHUB_TOKEN: 'test-token',
    GITHUB_TOKEN: 'test-token',
    CI: '', GITHUB_ACTIONS: '',
    SKIP_EVALS: '', SKIP_AGENTS: '0',
    RESULTS_DIR: join(workspace, 'results'),
    BASELINE_CACHE: '0', BASELINE_CACHE_ROOT: join(workspace, 'cache'),
    MODEL: '', JUDGE_MODEL: 'test-judge', DEFAULT_MODEL: 'test-default',
    RUNS: '', STIMULI: '', PILOT_RUNS: '',
    WORKERS: '1', PARALLEL: '1', LIVE_LOGS: '0',
  }
  delete env.SKILL_MAX_RETRIES
  return {
    workspace, spec, env,
    run(overrides = {}) {
      const result = spawnSync('bash', [join(workspace, 'eng/run-vally-evals.sh'), 'synthetic-runner'], {
        cwd: workspace, encoding: 'utf8', env: { ...env, ...overrides }, timeout: 30000,
      })
      const recorded = existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n').map(JSON.parse) : []
      return { ...result, calls: recorded, evals: recorded.filter(({ args }) => args[0] === 'eval') }
    },
  }
}

const value = (args, flag) => args[args.indexOf(flag) + 1]

describe('skill runner options with synthetic specs and a fake Vally', () => {
  for (const retries of [undefined, '0', '3']) {
    it(`passes retries ${retries ?? '(unset)'} to both arms without changing model or depth`, (t) => {
      const f = fixture(t)
      const result = f.run(retries === undefined ? {} : { SKILL_MAX_RETRIES: retries })
      strictEqual(result.status, 0, result.stdout + result.stderr)
      strictEqual(result.evals.length, 2)
      for (const { args, spec } of result.evals) {
        if (retries === undefined) strictEqual(args.includes('--max-retries'), false)
        else strictEqual(value(args, '--max-retries'), retries)
        strictEqual(value(args, '--model'), 'pinned-test-model')
        strictEqual(args.includes('--runs'), false)
        deepStrictEqual(spec, parse(source))
      }
      strictEqual(value(result.evals[1].args, '--skill-dir'), join(f.workspace, 'plugins/skraft-framework/skills/synthetic-runner'))
    })
  }

  for (const retries of ['', '-1', '1.5', 'abc', ' 0', '+1', '1e2', '0;echo nope']) {
    it(`rejects invalid retry value ${JSON.stringify(retries)} before any Vally invocation`, (t) => {
      const result = fixture(t).run({ SKILL_MAX_RETRIES: retries })
      strictEqual(result.status, 2, result.stdout + result.stderr)
      match(result.stderr, /SKILL_MAX_RETRIES.*nonnegative integer/)
      deepStrictEqual(result.calls, [])
    })
  }

  it('runs an aliased pilot beside its fixtures, preserving frozen source and model override', (t) => {
    const f = fixture(t)
    const result = f.run({ STIMULI: 'Consumer', PILOT_RUNS: '1', RUNS: '1', MODEL: 'forced-test-model', SKILL_MAX_RETRIES: '0' })
    strictEqual(result.status, 0, result.stdout + result.stderr)
    strictEqual(result.evals.length, 2)
    const original = parse(source)
    for (const { args, spec, fixtures } of result.evals) {
      strictEqual(value(args, '--eval-spec'), join(dirname(f.spec), '.pilot.eval.yaml'))
      strictEqual(value(args, '--model'), 'forced-test-model')
      strictEqual(value(args, '--runs'), '1')
      strictEqual(value(args, '--workers'), '1')
      strictEqual(value(args, '--max-retries'), '0')
      deepStrictEqual(spec, { ...original, defaults: { ...original.defaults, runs: 1 }, stimuli: [original.stimuli[1]] })
      deepStrictEqual(fixtures, ['synthetic fixture'])
    }
    strictEqual(readFileSync(f.spec, 'utf8'), source)
    strictEqual(existsSync(join(dirname(f.spec), '.pilot.eval.yaml')), false)
    deepStrictEqual(parse(readFileSync(join(f.workspace, 'results/synthetic-runner/pilot.eval.yaml'), 'utf8')), result.evals[0].spec)
  })

  it('forwards zero retries to a partial-cache baseline and the full treatment', (t) => {
    const f = fixture(t)
    const keys = stimulusKeys(source, { specDir: dirname(f.spec), model: 'pinned-test-model', judgeModel: 'test-judge', vally: f.env.VALLY })
    store([{ type: 'trial-result', status: 'success', stimulus: 'Definition', trialIndex: 0, gradeResult: { passed: true, score: 1 } }], keys, join(f.env.BASELINE_CACHE_ROOT, 'synthetic-runner'))
    // Synthetic cache only; no real evaluation records are used or created.
    const result = f.run({ BASELINE_CACHE: '1', SKILL_MAX_RETRIES: '0' })
    strictEqual(result.status, 0, result.stdout + result.stderr)
    strictEqual(result.evals.length, 2)
    strictEqual(value(result.evals[0].args, '--eval-spec'), join(dirname(f.spec), '.baseline-cache.eval.yaml'))
    deepStrictEqual(result.evals[0].spec.stimuli, [parse(source).stimuli[1]])
    deepStrictEqual(result.evals[0].fixtures, ['synthetic fixture'])
    deepStrictEqual(result.evals[1].spec, parse(source))
    for (const { args } of result.evals) strictEqual(value(args, '--max-retries'), '0')
    strictEqual(existsSync(join(dirname(f.spec), '.baseline-cache.eval.yaml')), false)
  })
})