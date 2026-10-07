import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import { evalMatrix, parseSkipList } from '../../eng/lib/eval-matrix.mjs'

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'))

describe('parseSkipList', () => {
  it('reads names the way the runner does: comments, blanks and inline reasons dropped', () => {
    const text = '# header\n\nalpha\nbeta   # too expensive for now\n  # indented comment\ngamma\n'
    deepStrictEqual(parseSkipList(text), ['alpha', 'beta', 'gamma'])
  })

  it('accepts the space-separated SKIP_EVALS override', () => {
    deepStrictEqual(parseSkipList('alpha beta'), ['alpha', 'beta'])
    deepStrictEqual(parseSkipList(''), [])
  })
})

describe('evalMatrix', () => {
  it('gives every subject its own cell with explicit runner arguments and a unique artifact', () => {
    const { include } = evalMatrix({ skills: ['outside-in-tdd'], agents: ['commit-convention'] })
    deepStrictEqual(include, [
      { kind: 'skill', name: 'outside-in-tdd', args: 'skills outside-in-tdd', artifact: 'eval-part-skill-outside-in-tdd' },
      { kind: 'agent', name: 'commit-convention', args: 'agents commit-convention', artifact: 'eval-part-agent-commit-convention' },
    ])
  })

  it('keeps a skill and an agent suite that share a name apart', () => {
    const { include } = evalMatrix({ skills: ['same'], agents: ['same'] })
    deepStrictEqual(include.map(({ args }) => args), ['skills same', 'agents same'])
    strictEqual(new Set(include.map(({ artifact }) => artifact)).size, 2)
  })

  it('leaves skipped subjects out before any runner starts, and says which', () => {
    const { include, skipped } = evalMatrix({ skills: ['a', 'b'], agents: ['c'], skip: ['b', 'c'] })
    deepStrictEqual(include.map(({ name }) => name), ['a'])
    deepStrictEqual(skipped, ['b', 'c'])
  })

  it('de-duplicates and sorts so the matrix is stable across runs', () => {
    const { include } = evalMatrix({ skills: ['z', 'a', 'z'] })
    deepStrictEqual(include.map(({ name }) => name), ['a', 'z'])
  })

  it('returns an empty include when nothing is left to run', () => {
    deepStrictEqual(evalMatrix({}).include, [])
  })
})

describe('plan-eval-matrix CLI', () => {
  const plan = (args, env = {}) =>
    spawnSync(process.execPath, [join(repoRoot, 'eng/plan-eval-matrix.mjs'), ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    })

  it('plans one named subject, honouring the skip list override', () => {
    const result = plan(['--subject', 'outside-in-tdd'], { SKIP_EVALS: '' })
    strictEqual(result.status, 0, result.stderr)
    deepStrictEqual(JSON.parse(result.stdout).include.map(({ args }) => args), ['skills outside-in-tdd'])
  })

  it('drops a named subject that is on the skip list', () => {
    const result = plan(['--subject', 'outside-in-tdd'], { SKIP_EVALS: 'outside-in-tdd' })
    strictEqual(result.status, 0, result.stderr)
    deepStrictEqual(JSON.parse(result.stdout).include, [])
  })

  it('refuses a subject with no spec instead of planning an empty cell', () => {
    const result = plan(['--subject', 'no-such-subject'])
    strictEqual(result.status, 1)
  })

  it('leaves agent suites out with --skills-only', () => {
    const result = plan(['--all', '--skills-only'], { SKIP_EVALS: '' })
    strictEqual(result.status, 0, result.stderr)
    const kinds = new Set(JSON.parse(result.stdout).include.map(({ kind }) => kind))
    deepStrictEqual([...kinds], ['skill'])
  })

  it('requires exactly one selection mode', () => {
    strictEqual(plan([]).status, 2)
    strictEqual(plan(['--all', '--subject', 'x']).status, 2)
  })
})
