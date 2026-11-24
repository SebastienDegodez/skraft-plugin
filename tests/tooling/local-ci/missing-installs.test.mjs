import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { missingInstalls } from '../../../eng/lib/missing-installs.mjs'

const ENGINE = join('plugins', 'skraft-framework', 'engine')

test('a fresh checkout is told to install the root, the engine and the handbook, with the root on npm install since its lockfile is not committed', () => {
  const notices = missingInstalls(() => false)

  assert.deepEqual(notices.map((n) => n.command), ['npm install', `npm ci --prefix ${ENGINE.split('\\').join('/')}`, 'npm ci --prefix docs/website'])
  assert.match(notices[0].text, /Playwright, the repository tooling, dashboard and backlog tests/)
  assert.match(notices[2].text, /workflow viewer test/)
})

test('a checkout with both installs is told nothing', () => {
  assert.deepEqual(missingInstalls(() => true), [])
})

test('only the root missing names only npm install', () => {
  const notices = missingInstalls((dir) => dir !== 'node_modules')

  assert.deepEqual(notices.map((n) => n.command), ['npm install'])
})
