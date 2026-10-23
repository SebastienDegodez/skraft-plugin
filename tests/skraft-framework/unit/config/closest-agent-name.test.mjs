import { test } from 'node:test'
import assert from 'node:assert/strict'
import { closestName } from '../../../../plugins/skraft-framework/engine/domain/config/agent-names.mjs'

// The rule behind doctor's "did you mean" (models-families: an agent rule nobody provides): the
// fewest letters added, removed or changed, the first listed on a tie.
test('the closest name needs the fewest letters added, removed or changed, the first listed on a tie', () => {
  const agents = ['solution-architect', 'software-engineer', 'cold-reader-lens', 'coverage-lens']
  assert.deepEqual(['sofware-engineer', 'cold-reader', 'coverage-lenz', 'solution-architects', 'software-enginer'].map((name) => closestName(name, agents)), [
    'software-engineer', 'cold-reader-lens', 'coverage-lens', 'solution-architect', 'software-engineer',
  ])
  assert.equal(closestName('ab', ['xb', 'ay']), 'xb')
  assert.equal(closestName('abc', ['abcde', 'xbc']), 'xbc')
  assert.equal(closestName('kitten', ['sitting', 'kitchen']), 'kitchen')
})
