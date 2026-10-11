import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '../../..')
const WINDOWS_MARKETPLACE_PATH_BUDGET = 145

test('plugin packaging: tracked paths stay within Windows marketplace path budget', () => {
  const tracked = execFileSync('git', ['-C', repoRoot, 'ls-files', '-z'], { encoding: 'buffer' })
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
  const offenders = tracked
    .map((path) => ({ path, length: path.length }))
    .filter(({ length }) => length > WINDOWS_MARKETPLACE_PATH_BUDGET)
    .sort((left, right) => right.length - left.length || left.path.localeCompare(right.path))

  assert.deepEqual(
    offenders,
    [],
    offenders.map(({ length, path }) => `${length} ${path}`).join('\n'),
  )
})
