import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withoutRepositoryEnv } from '../../../eng/lib/repository-env.mjs'

const SCOPE = fileURLToPath(new URL('../../../eng/mutation-scope.mjs', import.meta.url))
const ENGINE = 'plugins/skraft-framework/engine'
const env = withoutRepositoryEnv(process.env)
const CONFIG = `export default { mutate: ['${ENGINE}/**/*.mjs', '!${ENGINE}/drivers/cli/skraft.mjs', '!${ENGINE}/stryker.config.mjs', '!${ENGINE}/node_modules/**'] }\n`

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=skraft', '-c', 'user.email=skraft@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, env, encoding: 'utf8' }).trim()
const lines = (count, word = 'line') => Array.from({ length: count }, (_, index) => `${word} ${index + 1}`).join('\n') + '\n'

/** A repository whose main branch holds an engine, then a lot branch off it. */
const repository = (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'skraft-mutation-scope-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  write(`${ENGINE}/stryker.config.mjs`, CONFIG)
  write(`${ENGINE}/application/run.mjs`, lines(10))
  write(`${ENGINE}/domain/rule.mjs`, lines(5))
  write(`${ENGINE}/drivers/cli/skraft.mjs`, lines(3))
  git(root, 'init', '-q', '-b', 'main')
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', 'feat: engine')
  git(root, 'switch', '-q', '-c', 'lot')
  return { root, write }
}

const scope = (cwd, ...args) => spawnSync(process.execPath, [SCOPE, ...args], { cwd, env, encoding: 'utf8' })

test('a lot mutates the engine lines it added or changed since the branch it targets, and nothing else', (t) => {
  const { root, write } = repository(t)
  write(`${ENGINE}/application/run.mjs`, lines(10).replace('line 3\n', 'changed 3\n').replace('line 7\nline 8\n', 'changed 7\nchanged 8\nadded\n'))
  write(`${ENGINE}/domain/rule.mjs`, lines(5).replace('line 2\n', ''))
  write(`${ENGINE}/domain/new-rule.mjs`, lines(2))
  write(`${ENGINE}/drivers/cli/skraft.mjs`, lines(3, 'cli'))
  write(`${ENGINE}/README.md`, 'docs\n')
  write('tests/run.test.mjs', lines(2))
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', 'feat: lot')
  git(root, 'switch', '-q', 'main')
  write('docs.md', 'later on main\n')
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', 'docs: later')
  git(root, 'switch', '-q', 'lot')

  const run = scope(root, '--base', 'main', '--head', 'HEAD')

  assert.equal(run.status, 0, run.stderr)
  assert.deepEqual(run.stdout.split('\n').filter(Boolean), [
    `${ENGINE}/application/run.mjs:3-3`,
    `${ENGINE}/application/run.mjs:7-9`,
    `${ENGINE}/domain/new-rule.mjs:1-2`,
  ])
})

test('without --head the uncommitted changes count too; with nothing changed the run says so and mutates nothing', (t) => {
  const { root, write } = repository(t)

  const idle = scope(root, '--base', 'main', '--run')
  assert.equal(idle.status, 0, idle.stderr)
  assert.equal(idle.stdout.trim(), 'No engine line changed since main: nothing to mutate.')

  write(`${ENGINE}/domain/rule.mjs`, lines(5).replace('line 5\n', 'changed 5\n'))
  const working = scope(root, '--base', 'main')
  assert.deepEqual(working.stdout.split('\n').filter(Boolean), [`${ENGINE}/domain/rule.mjs:5-5`])
})

test('a base Git cannot resolve is refused with the reason', (t) => {
  const { root } = repository(t)

  const run = scope(root, '--base', 'origin/nowhere')

  assert.equal(run.status, 2)
  assert.match(run.stderr, /^cannot find the merge base of origin\/nowhere and HEAD: /)
})
