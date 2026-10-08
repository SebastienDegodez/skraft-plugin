import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../../../', import.meta.url))
const shipped = 'plugins/skraft-framework/skills/clean-architecture-react/eslint/clean-architecture.js'
const evaluated = 'tests/skills/clean-architecture-react/fixtures/todos-vite/eslint/clean-architecture.js'

test('the ESLint layer rules the eval runs are the ones the skill ships', () => {
  assert.equal(readFileSync(repo + evaluated, 'utf8'), readFileSync(repo + shipped, 'utf8'),
    `${evaluated} drifted from ${shipped}: copy the skill's file over the fixture`)
})
