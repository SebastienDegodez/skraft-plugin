import { deepStrictEqual, match, strictEqual } from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { parse } from 'yaml'
import { stimulusKeys, store } from '../../eng/lib/baseline-cache.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const source = `name: synthetic-runner
type: capability
defaults:
  model: pinned-family
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
  // The declared evaluation models of this workspace: the spec pins a family, the runner resolves it.
  writeFileSync(join(workspace, 'eng/eval-models.json'), JSON.stringify({
    families: { 'pinned-family': 'pinned-test-model', 'fallback-family': 'test-default' },
    default: 'fallback-family',
    judge: 'test-judge',
  }))
  const spec = join(workspace, 'tests/skills/synthetic-runner/eval.yaml')
  mkdirSync(join(dirname(spec), 'fixtures'), { recursive: true })
  writeFileSync(spec, source)
  writeFileSync(join(dirname(spec), 'fixtures/input.txt'), 'synthetic fixture')
  const skill = join(workspace, 'plugins/skraft-framework/skills/synthetic-runner')
  mkdirSync(skill, { recursive: true })
  writeFileSync(join(skill, 'SKILL.md'), '# Synthetic skill\n')
  // The checkout's own instruction files, which Copilot would read beside the skill.
  writeFileSync(join(workspace, 'AGENTS.md'), '# Repository rules\n')
  mkdirSync(join(workspace, '.github'), { recursive: true })
  writeFileSync(join(workspace, '.github/copilot-instructions.md'), '# Repository instructions\n')
  const calls = join(workspace, 'calls.jsonl')
  const fake = join(workspace, 'fake-vally.mjs')
  writeFileSync(fake, `import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parse } from 'yaml'
const args = process.argv.slice(2)
const value = (flag) => args[args.indexOf(flag) + 1]
const call = { args, start: Date.now(), cwd: process.cwd(), instructionDirs: process.env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS ?? null }
if (args[0] === 'eval') {
  // Lets a test hold an arm open long enough to observe whether the other arm
  // ran beside it or after it.
  const sleep = Number(process.env.FAKE_SLEEP_MS || 0)
  if (sleep) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, sleep)
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
call.end = Date.now()
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
    MODEL: '', JUDGE_MODEL: '',
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

// The arms may run concurrently, so the order Vally was called in says nothing
// about which arm a call was. Its output directory does.
const arm = (evals, name) => {
  const found = evals.filter(({ args }) => value(args, '--output-dir').endsWith(`/${name}`))
  strictEqual(found.length, 1, `expected exactly one ${name} arm`)
  return found[0]
}

describe('skill runner options with synthetic specs and a fake Vally', () => {
  it('starts both arms outside the checkout, in a folder with no instruction file and no instruction folder named', (t) => {
    const f = fixture(t)
    const result = f.run({ COPILOT_CUSTOM_INSTRUCTIONS_DIRS: f.workspace })
    strictEqual(result.status, 0, result.stdout + result.stderr)
    strictEqual(result.evals.length, 2)
    for (const name of ['baseline', 'skilled']) {
      const { cwd, instructionDirs } = arm(result.evals, name)
      // The arm reports its real cwd (/private/var/… on macOS, where tmpdir() is /var/…); its folder is gone once it ends.
      strictEqual(relative(realpathSync(f.workspace), cwd).startsWith('..'), true, `${name} arm started in ${cwd}`)
      strictEqual(relative(realpathSync(root), cwd).startsWith('..'), true, `${name} arm started in ${cwd}`)
      for (const file of ['AGENTS.md', '.github/copilot-instructions.md', 'CLAUDE.md']) strictEqual(existsSync(join(cwd, file)), false, `${name}: ${file}`)
      strictEqual(instructionDirs, null)
    }
    strictEqual(value(arm(result.evals, 'skilled').args, '--eval-spec'), f.spec)
  })

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
      strictEqual(value(arm(result.evals, 'skilled').args, '--skill-dir'), join(f.workspace, 'plugins/skraft-framework/skills/synthetic-runner'))
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

  it('stops before any Vally invocation when a spec pins a family the declared models omit', (t) => {
    const f = fixture(t)
    writeFileSync(f.spec, source.replace('model: pinned-family', 'model: undeclared-family'))
    const result = f.run()
    strictEqual(result.status, 1, result.stdout + result.stderr)
    match(result.stderr, /undeclared-family/)
    deepStrictEqual(result.calls, [])
  })

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
    const baseline = arm(result.evals, 'baseline')
    strictEqual(value(baseline.args, '--eval-spec'), join(dirname(f.spec), '.baseline-cache.eval.yaml'))
    deepStrictEqual(baseline.spec.stimuli, [parse(source).stimuli[1]])
    deepStrictEqual(baseline.fixtures, ['synthetic fixture'])
    deepStrictEqual(arm(result.evals, 'skilled').spec, parse(source))
    for (const { args } of result.evals) strictEqual(value(args, '--max-retries'), '0')
    strictEqual(existsSync(join(dirname(f.spec), '.baseline-cache.eval.yaml')), false)
  })

  it('runs the baseline and skilled arms side by side by default', (t) => {
    const f = fixture(t)
    const result = f.run({ FAKE_SLEEP_MS: '800' })
    strictEqual(result.status, 0, result.stdout + result.stderr)
    const baseline = arm(result.evals, 'baseline')
    const skilled = arm(result.evals, 'skilled')
    strictEqual(baseline.start < skilled.end && skilled.start < baseline.end, true, 'the arms did not overlap')
    // Pairing waits for both: the verdict exists and was built from both arms.
    strictEqual(existsSync(join(f.env.RESULTS_DIR, 'synthetic-runner/results.json')), true)
    const log = readFileSync(join(f.env.RESULTS_DIR, 'synthetic-runner/eval.log'), 'utf8')
    strictEqual(log.includes('missing baseline or skilled records'), false)
  })

  it('runs the arms one after the other with ARMS_PARALLEL=0', (t) => {
    const f = fixture(t)
    const result = f.run({ FAKE_SLEEP_MS: '300', ARMS_PARALLEL: '0' })
    strictEqual(result.status, 0, result.stdout + result.stderr)
    strictEqual(arm(result.evals, 'baseline').end <= arm(result.evals, 'skilled').start, true)
  })

  it('rejects an ARMS_PARALLEL value other than 0 or 1 before any Vally invocation', (t) => {
    const result = fixture(t).run({ ARMS_PARALLEL: 'yes' })
    strictEqual(result.status, 2, result.stdout + result.stderr)
    deepStrictEqual(result.calls, [])
  })
})
