import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadEvalSpec } from '@microsoft/vally'

const RESOLVER = new URL('../../eng/resolve-eval-model.mjs', import.meta.url).pathname
const DEFAULT_MODEL = 'claude-sonnet-5'

const resolve = (specPath, env = {}) =>
  execFileSync('node', [RESOLVER, specPath, DEFAULT_MODEL], {
    encoding: 'utf8',
    // A stray MODEL in the developer's shell must not decide the test.
    env: { ...process.env, MODEL: '', ...env },
  })

const specWith = (defaults) => {
  const dir = mkdtempSync(join(tmpdir(), 'eval-model-'))
  const path = join(dir, 'eval.yaml')
  writeFileSync(
    path,
    `name: probe\ndescription: A probe spec.\ntype: capability\ndefaults:\n${defaults}scoring:\n  threshold: 1\nstimuli:\n  - name: Anything\n    prompt: |\n      Do a thing.\n    rubric:\n      - It did the thing.\n`,
  )
  return path
}

test('resolver: a spec that pins nothing falls back to the repository default', () => {
  assert.equal(resolve(specWith('  runs: 2\n')), DEFAULT_MODEL)
})

test('resolver: a spec that pins defaults.model gets its pin', () => {
  assert.equal(resolve(specWith('  runs: 2\n  model: gpt-5.6-luna\n')), 'gpt-5.6-luna')
})

// The CI model-comparison matrix sets MODEL per arm. If a spec could opt out of
// the model under test, that arm would be measuring something else while still
// being published under the arm's name.
test('resolver: MODEL in the environment overrides a spec pin', () => {
  const pinned = specWith('  runs: 2\n  model: gpt-5.6-luna\n')
  assert.equal(resolve(pinned, { MODEL: 'grok-4.6' }), 'grok-4.6')
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

// Guards the wiring, not just the resolver: the runner must read its default
// from one place, and the judge must not silently follow the agent model.
test('runner: declares the sonnet default and keeps the judge pinned separately', () => {
  const sh = readFileSync(new URL('../../eng/run-vally-evals.sh', import.meta.url), 'utf8')
  assert.match(sh, /DEFAULT_MODEL="\$\{DEFAULT_MODEL:-claude-sonnet-5\}"/)
  assert.match(sh, /JUDGE_MODEL="\$\{JUDGE_MODEL:-gpt-5\.6-luna\}"/)
  assert.match(sh, /^MODEL="\$\{MODEL:-\}"$/m, 'MODEL must default to empty so resolution happens per eval')
  // Both eval paths must resolve, or one of them silently keeps a stale global.
  assert.equal((sh.match(/MODEL="\$\(resolve_eval_model "\$EVAL_SPEC"\)"/g) ?? []).length, 2)
})

// Every pin must be a real model name. A typo yields an arm the backend rejects
// or, worse, silently reroutes.
test('specs: every pinned model is one the shipped specs agree on', async () => {
  const root = new URL('../skills/', import.meta.url).pathname
  const pinned = []
  for (const dir of readdirSync(root)) {
    const spec = join(root, dir, 'eval.yaml')
    let loaded
    try {
      loaded = await loadEvalSpec(spec)
    } catch {
      continue
    }
    const model = (loaded?.spec ?? loaded)?.defaults?.model
    if (model) pinned.push([dir, model])
  }
  for (const [dir, model] of pinned) {
    assert.match(model, /^[a-z0-9][a-z0-9.\-]*$/, `${dir} pins a malformed model id: ${model}`)
  }
})
