// red-commit: build, run the acceptance tests, commit only a real RED — one turn for the RED.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it } from 'node:test'

import { parseRedCommitArgs } from '../../../plugins/skraft-framework/skills/outside-in-tdd/scripts/red-commit.mjs'

const SCRIPT = fileURLToPath(new URL('../../../plugins/skraft-framework/skills/outside-in-tdd/scripts/red-commit.mjs', import.meta.url))
const node = JSON.stringify(process.execPath)

let workspace
before(() => { workspace = realpathSync(mkdtempSync(join(tmpdir(), 'red-commit-'))) })
after(() => rmSync(workspace, { recursive: true, force: true }))

const repo = (name) => {
  const root = join(workspace, name)
  execFileSync('git', ['init', '--quiet', root])
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
  git('config', 'user.email', 'd@x.invalid')
  git('config', 'user.name', 'D')
  git('commit', '--quiet', '--allow-empty', '-m', 'chore(shop): base')
  writeFileSync(join(root, 'S1Tests.cs'), '// S1\n')
  writeFileSync(join(root, 'Stub.cs'), '// stub\n')
  writeFileSync(join(root, 'plan.md'), 'not part of the RED\n')
  return { root, git }
}

const redCommit = (root, { build = 0, test = 1 } = {}) => spawnSync(process.execPath, [SCRIPT,
  '--root', root,
  '--build', `${node} -e "process.exit(${build})"`,
  '--test', `${node} -e "console.log('Failed S1_Gold: expected 1500, got 0'); process.exit(${test})"`,
  '--message', 'test(shop): acceptance tests S1–S1', '--', 'S1Tests.cs', 'Stub.cs'], { encoding: 'utf8' })

describe('red-commit', () => {
  it('commits the named files when the build passes and the tests fail, and shows the failures', () => {
    const { root, git } = repo('red')

    const result = redCommit(root)

    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.match(result.stdout, /Failed S1_Gold: expected 1500, got 0/)
    assert.match(result.stdout, /RED committed: \w+ test\(shop\): acceptance tests S1–S1/)
    assert.equal(git('log', '-1', '--format=%s'), 'test(shop): acceptance tests S1–S1')
    assert.match(git('log', '-1', '--format=%B'), /Signed-off-by: D <d@x.invalid>/)
    assert.deepEqual(git('show', '--name-only', '--format=', 'HEAD').split('\n').sort(), ['S1Tests.cs', 'Stub.cs'])
  })

  it('refuses a broken build, and commits nothing', () => {
    const { root, git } = repo('broken')

    const result = redCommit(root, { build: 1 })

    assert.equal(result.status, 3)
    assert.match(result.stdout, /RED refused: the build failed/)
    assert.equal(git('log', '-1', '--format=%s'), 'chore(shop): base')
  })

  it('refuses a run where nothing fails: that is no RED', () => {
    const { root, git } = repo('green')

    const result = redCommit(root, { test: 0 })

    assert.equal(result.status, 4)
    assert.match(result.stdout, /every acceptance test passed/)
    assert.equal(git('log', '-1', '--format=%s'), 'chore(shop): base')
  })

  it('asks for every command, the message and the files', () => {
    assert.throws(() => parseRedCommitArgs(['--build', 'b', '--test', 't', '--', 'a.cs']), /--message is required/)
    assert.throws(() => parseRedCommitArgs(['--build', 'b', '--test', 't', '--message', 'm']), /name each test and stub file/)
    assert.deepEqual(parseRedCommitArgs(['--build', 'b', '--test', 't', '--message', 'm', '--', 'a.cs']), { root: '.', build: 'b', test: 't', message: 'm', files: ['a.cs'] })
  })
})
