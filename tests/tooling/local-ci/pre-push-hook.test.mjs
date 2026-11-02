import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const HOOK = resolve(import.meta.dirname, '../../../.githooks/pre-push')
const ZERO = '0'.repeat(40)
const SHA = 'b71f86a61f7117e4a436af367c90f2536b436dc7'

// A clone whose local CI only leaves a mark that it ran.
const clone = (t) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'skraft pre-push ')))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  mkdirSync(join(dir, 'scripts'))
  writeFileSync(join(dir, 'scripts', 'local-ci.mjs'), "import { writeFileSync } from 'node:fs'\nwriteFileSync('local-ci-ran', '')\n")
  return dir
}

// What git writes to a pre-push hook's stdin: one `<local ref> <local sha> <remote ref> <remote sha>` line per ref.
const push = (cwd, lines) => spawnSync('sh', [HOOK, 'origin', 'https://example.invalid/repo.git'], { cwd, input: lines.map((line) => `${line}\n`).join(''), encoding: 'utf8' })

test('a push that only deletes a tag and a note skips the local CI', (t) => {
  const dir = clone(t)

  const result = push(dir, [
    `(delete) ${ZERO} refs/tags/cli-v1.0.0-alpha.1 ${SHA}`,
    `(delete) ${ZERO} refs/notes/semantic-release-cli-v1.0.0-alpha.1 ${SHA}`,
  ])

  assert.equal(result.status, 0)
  assert.equal(existsSync(join(dir, 'local-ci-ran')), false)
})

test('a push that deletes a tag and updates a branch runs the local CI', (t) => {
  const dir = clone(t)

  const result = push(dir, [
    `(delete) ${ZERO} refs/tags/cli-v1.0.0-alpha.1 ${SHA}`,
    `refs/heads/v2/work ${SHA} refs/heads/v2/work ${ZERO}`,
  ])

  assert.equal(result.status, 0)
  assert.equal(existsSync(join(dir, 'local-ci-ran')), true)
})
