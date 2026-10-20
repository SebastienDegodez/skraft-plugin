import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MODEL_FAMILIES,
  copilotModelsForFamily,
  familyForCopilotModel,
  floorForRequirement,
  isModelFamily,
  meetsFloor,
} from '../../../eng/lib/model-family-policy.mjs'

test('the model families are haiku, sonnet and opus', () => {
  assert.deepEqual([...MODEL_FAMILIES], ['haiku', 'sonnet', 'opus'])
  for (const family of MODEL_FAMILIES) assert.equal(isModelFamily(family), true)
  for (const value of ['inherit', 'Claude Sonnet 5', undefined, 'constructor']) assert.equal(isModelFamily(value), false)
})

test('each family lists its preferred Copilot model first', () => {
  assert.equal(copilotModelsForFamily('haiku')[0], 'GPT-5.6 Luna')
  assert.equal(copilotModelsForFamily('sonnet')[0], 'Claude Sonnet 5.5')
  assert.equal(copilotModelsForFamily('opus')[0], 'Claude Opus 5')
  assert.throws(() => copilotModelsForFamily('reviewer'), /Unknown model family: reviewer/)
})

test('a Copilot model name maps back to exactly its family', () => {
  assert.equal(familyForCopilotModel('Claude Haiku 4.5 (copilot)'), 'haiku')
  assert.equal(familyForCopilotModel('claude-sonnet-5'), 'sonnet')
  assert.equal(familyForCopilotModel('claude-opus-5'), 'opus')
  assert.equal(familyForCopilotModel('inherit'), undefined)
  for (const family of MODEL_FAMILIES) {
    for (const model of copilotModelsForFamily(family)) assert.equal(familyForCopilotModel(model), family, model)
  }
})

test('a Sonnet-class requirement sets the floor at sonnet', () => {
  assert.equal(floorForRequirement('Sonnet-class or above. Low-tier models are NOT supported.'), 'sonnet')
  assert.equal(floorForRequirement('anything else'), null)
  assert.equal(floorForRequirement(undefined), null)
  assert.equal(meetsFloor('haiku', 'sonnet'), false)
  assert.equal(meetsFloor('sonnet', 'sonnet'), true)
  assert.equal(meetsFloor('opus', 'sonnet'), true)
  assert.equal(meetsFloor('haiku', null), true)
})
