import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const entry = fileURLToPath(new URL('../../../../plugins/skraft-design/engine/drivers/cli/ci-reply.mjs', import.meta.url))
const CONFIG = { components: [{ name: 'shop', root: '.', stack: 'typescript', paths: { src: ['src/'], tests: ['test/'] }, commands: {} }],
  publish: { pullRequest: true, questionVersions: { pullRequest: 2 } } }

/** A working copy with the design configuration and a comment a CI workflow saved, the executable run on it. */
const replyIn = async (t, comment) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'skraft design reply ')))
  t.after(() => rm(root, { recursive: true, force: true }))
  spawnSync('git', ['init', '--quiet', '--initial-branch=main', root])
  writeFileSync(join(root, 'skraft-design-config.json'), JSON.stringify(CONFIG))
  writeFileSync(join(root, 'comment.md'), comment)
  return spawnSync(process.execPath, [entry, '--author', 'octocat', '--comment-file', join(root, 'comment.md')], { cwd: root, encoding: 'utf8', env: { ...process.env, HOME: root } })
}

test('a CI workflow hands a saved comment to the design engine, which refuses one that is no reply without starting anything', async (t) => {
  const result = await replyIn(t, 'Looks good to me')
  assert.equal(result.status, 1, result.stderr)
  const outcome = JSON.parse(result.stdout.trim().split('\n').at(-1))
  assert.equal(outcome.code, 'not-an-answer')
})

test('a reply with no run to answer is refused, naming why', async (t) => {
  const result = await replyIn(t, '/skraft-answer {"key":"architecture-questions-0-abc","answer":{"Q1":"A"}}')
  assert.equal(result.status, 1, result.stderr)
  const outcome = JSON.parse(result.stdout.trim().split('\n').at(-1))
  assert.notEqual(outcome.code, 'not-an-answer')
  assert.equal(outcome.ok, false)
})
