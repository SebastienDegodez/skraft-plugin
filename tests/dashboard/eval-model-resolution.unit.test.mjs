import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const RESOLVER = new URL('../../eng/resolve-eval-model.mjs', import.meta.url).pathname
// The one place the evaluation models are declared. Expectations derive from it, so no test
// names a model of its own.
const DECLARED = JSON.parse(readFileSync(new URL('../../eng/eval-models.json', import.meta.url), 'utf8'))
const DEFAULT_MODEL = DECLARED.families[DECLARED.default]

const run = (args, env = {}) =>
  spawnSync('node', [RESOLVER, ...args], {
    encoding: 'utf8',
    // A stray MODEL or JUDGE_MODEL in the developer's shell must not decide the test.
    env: { ...process.env, MODEL: '', JUDGE_MODEL: '', ...env },
  })

const resolve = (specPath, env = {}) => {
  const result = run([specPath], env)
  assert.equal(result.status, 0, result.stderr)
  return result.stdout
}

const specWith = (defaults) => {
  const dir = mkdtempSync(join(tmpdir(), 'eval-model-'))
  const path = join(dir, 'eval.yaml')
  writeFileSync(
    path,
    `name: probe\ndescription: A probe spec.\ntype: capability\ndefaults:\n${defaults}scoring:\n  threshold: 1\nstimuli:\n  - name: Anything\n    prompt: |\n      Do a thing.\n    rubric:\n      - It did the thing.\n`,
  )
  return path
}

test('declared models: the default and every family name a model, the judge is pinned apart', () => {
  assert.ok(Object.keys(DECLARED.families).length >= 2, 'two families at least: a spec chooses between them')
  for (const [family, model] of Object.entries(DECLARED.families)) {
    assert.match(family, /^[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*$/, `${family} is no family word`)
    assert.ok(typeof model === 'string' && model.trim(), `${family} names no model`)
  }
  assert.ok(DEFAULT_MODEL, `the default ${DECLARED.default} is no declared family`)
  assert.ok(typeof DECLARED.judge === 'string' && DECLARED.judge.trim(), 'the judge names no model')
})

test('resolver: a spec that pins nothing runs on the declared default family', () => {
  assert.equal(resolve(specWith('  runs: 2\n')), DEFAULT_MODEL)
})

test('resolver: a spec that pins a family runs on the model that family declares', () => {
  for (const [family, model] of Object.entries(DECLARED.families)) {
    assert.equal(resolve(specWith(`  runs: 2\n  model: ${family}\n`)), model, family)
  }
})

test('resolver: a spec that pins a name no family declares is refused, naming the file to fix', () => {
  const result = run([specWith('  runs: 2\n  model: no-such-family\n')])
  assert.notEqual(result.status, 0)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /no-such-family/)
  assert.match(result.stderr, /eng\/eval-models\.json/)
})

// The CI model-comparison matrix sets MODEL per arm. If a spec could opt out of
// the model under test, that arm would be measuring something else while still
// being published under the arm's name.
test('resolver: MODEL in the environment overrides a spec pin, a family resolved and a name kept', () => {
  const [family, model] = Object.entries(DECLARED.families).find(([name]) => name !== DECLARED.default)
  const pinned = specWith(`  runs: 2\n  model: ${DECLARED.default}\n`)
  assert.equal(resolve(pinned, { MODEL: family }), model)
  assert.equal(resolve(pinned, { MODEL: 'dispatch-typed-model' }), 'dispatch-typed-model')
})

test('resolver: an unreadable spec falls back rather than stopping the portfolio', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eval-model-bad-'))
  const path = join(dir, 'eval.yaml')
  writeFileSync(path, 'name: [unclosed\n')
  assert.equal(resolve(path), DEFAULT_MODEL)
})

test('resolver: a blank or whitespace pin is not a pin', () => {
  assert.equal(resolve(specWith('  runs: 2\n  model: "   "\n')), DEFAULT_MODEL)
})

test('resolver: the judge is the declared one unless JUDGE_MODEL names another', () => {
  const judge = (env) => {
    const result = run(['--judge'], env)
    assert.equal(result.status, 0, result.stderr)
    return result.stdout
  }
  assert.equal(judge(), DECLARED.judge)
  const [family, model] = Object.entries(DECLARED.families)[0]
  assert.equal(judge({ JUDGE_MODEL: family }), model)
  assert.equal(judge({ JUDGE_MODEL: 'dispatch-typed-judge' }), 'dispatch-typed-judge')
})

// Guards the wiring, not just the resolver: the runner reads both models from the
// declared file, and the judge never follows the agent model.
test('runner: reads the agent and judge models through the resolver only', () => {
  const sh = readFileSync(new URL('../../eng/run-vally-evals.sh', import.meta.url), 'utf8')
  assert.match(sh, /^MODEL="\$\{MODEL:-\}"$/m, 'MODEL must default to empty so resolution happens per eval')
  assert.match(sh, /^JUDGE_MODEL="\$\(node "\$SKRAFT_ROOT\/eng\/resolve-eval-model\.mjs" --judge\)"/m)
  assert.doesNotMatch(sh, /DEFAULT_MODEL/, 'the default family lives in eng/eval-models.json')
  // Both eval paths must resolve, or one of them silently keeps a stale global.
  assert.equal((sh.match(/MODEL="\$\(resolve_eval_model "\$EVAL_SPEC"\)"/g) ?? []).length, 2)
})
