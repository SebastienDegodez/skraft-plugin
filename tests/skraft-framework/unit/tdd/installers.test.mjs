import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installerIn } from '../../../../plugins/skraft-framework/engine/domain/gates/command-line.mjs'

test('a command line that installs dependencies names its installer; one that only runs a script or tests names none', () => {
  const lines = [
    'npm ci', 'npm install --no-audit', 'npm cit', 'npm install-ci-test', 'npx pnpm install', 'yarn install --frozen-lockfile',
    'uv sync --frozen', 'python -m pip install -e .', 'npm run ci', 'npm test', 'yarn test', 'uv run pytest', 'pip list',
  ]

  assert.deepEqual(lines.map((line) => installerIn(line.split(' '))), [
    'npm ci', 'npm install', 'npm cit', 'npm install-ci-test', 'pnpm install', 'yarn install',
    'uv sync', 'pip install', null, null, null, null, null,
  ])
})
