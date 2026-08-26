import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ModelTier, maxTier } from '../../plugins/skraft-framework/src/domain/model-tier.mjs'
import {
  tierForClass,
  modelForTier,
  modelsForTier,
  floorForRequirement,
} from '../../plugins/skraft-framework/src/domain/model-class-policy.mjs'
import { resolveModel } from '../../plugins/skraft-framework/src/application/resolve-model.mjs'

// --- domain: ModelTier ---

test('ModelTier ranks economy < standard < frontier', () => {
  assert.ok(ModelTier('economy').rank < ModelTier('standard').rank)
  assert.ok(ModelTier('standard').rank < ModelTier('frontier').rank)
})

test('ModelTier is frozen and carries its name', () => {
  const tier = ModelTier('standard')
  assert.equal(tier.type, 'ModelTier')
  assert.equal(tier.value, 'standard')
  assert.ok(Object.isFrozen(tier))
})

test('ModelTier rejects an unknown tier name', () => {
  assert.throws(() => ModelTier('ultra'), /Invalid model tier: ultra/)
})

test('maxTier returns the more capable tier (either argument order)', () => {
  const economy = ModelTier('economy')
  const frontier = ModelTier('frontier')
  assert.equal(maxTier(economy, frontier).value, 'frontier')
  assert.equal(maxTier(frontier, economy).value, 'frontier')
})

test('maxTier returns the first argument when both ranks are equal', () => {
  const first = ModelTier('standard')
  const second = ModelTier('standard')
  assert.ok(Object.is(maxTier(first, second), first), 'ties keep the left operand (>= not >)')
})

// --- domain: policy maps ---

test('tierForClass maps the B12 classes', () => {
  assert.equal(tierForClass('reviewer').value, 'economy')
  assert.equal(tierForClass('implementer').value, 'standard')
  assert.equal(tierForClass('researcher').value, 'standard')
  assert.equal(tierForClass('planner').value, 'frontier')
})

test('tierForClass rejects an unknown class', () => {
  assert.throws(() => tierForClass('architect'), /Unknown cost_role_class: architect/)
})

test('modelForTier returns the preferred model of each tier', () => {
  assert.equal(modelForTier(ModelTier('economy')), 'GPT-5.6 Luna')
  assert.equal(modelForTier(ModelTier('standard')), 'Claude Sonnet 5')
  assert.equal(modelForTier(ModelTier('frontier')), 'Claude Sonnet 5')
})

test('economy accepts either Luna or Haiku, under any spelling a harness uses', () => {
  const accepted = modelsForTier(ModelTier('economy'))
  for (const model of ['GPT-5.6 Luna', 'GPT-5.6 Luna (copilot)', 'gpt-5.6-luna']) {
    assert.ok(accepted.includes(model), `Luna spelling not accepted: ${model}`)
  }
  for (const model of ['Claude Haiku 4.5', 'Claude Haiku 4.5 (copilot)']) {
    assert.ok(accepted.includes(model), `Haiku spelling not accepted: ${model}`)
  }
})

test('economy prefers Luna without forbidding Haiku', () => {
  const accepted = modelsForTier(ModelTier('economy'))
  assert.equal(accepted[0], 'GPT-5.6 Luna', 'the preferred entry is what --apply pins')
  assert.ok(accepted.includes('Claude Haiku 4.5'), 'a preference must not become an exclusion')
})

test('modelsForTier rejects a tier with no mapped model', () => {
  assert.throws(() => modelsForTier({ value: 'ghost' }), /No model for tier: ghost/)
})

test('modelForTier rejects a tier with no mapped model', () => {
  assert.throws(() => modelForTier({ value: 'ghost' }), /No model for tier: ghost/)
})

test('floorForRequirement returns standard floor for a Sonnet-class requirement', () => {
  assert.equal(floorForRequirement('Sonnet-class or above. Needs reasoning.').value, 'standard')
})

test('floorForRequirement is case-insensitive', () => {
  assert.equal(floorForRequirement('requires SONNET-CLASS model').value, 'standard')
})

test('floorForRequirement returns null when no floor is declared', () => {
  assert.equal(floorForRequirement('Any model is fine'), null)
  assert.equal(floorForRequirement(undefined), null)
})

test('floorForRequirement ignores non-string inputs even if they stringify to a match', () => {
  assert.equal(floorForRequirement({ toString: () => 'needs sonnet-class' }), null)
})

// --- application: resolveModel ---

test('resolveModel maps a plain reviewer to economy', () => {
  const resolved = resolveModel({ costRoleClass: 'reviewer' })
  assert.equal(resolved.tier, 'economy')
  assert.equal(resolved.model, 'GPT-5.6 Luna')
  assert.deepEqual([...resolved.accepted], [...modelsForTier(ModelTier('economy'))])
})

test('resolveModel maps an implementer to standard', () => {
  const resolved = resolveModel({ costRoleClass: 'implementer' })
  assert.equal(resolved.tier, 'standard')
  assert.equal(resolved.model, 'Claude Sonnet 5')
})

test('resolveModel maps a researcher to standard', () => {
  const resolved = resolveModel({ costRoleClass: 'researcher' })
  assert.equal(resolved.tier, 'standard')
  assert.equal(resolved.model, 'Claude Sonnet 5')
})

test('resolveModel maps a planner to frontier', () => {
  const resolved = resolveModel({ costRoleClass: 'planner' })
  assert.equal(resolved.tier, 'frontier')
  assert.equal(resolved.model, 'Claude Sonnet 5')
})

test('resolveModel raises a reviewer to standard when a Sonnet floor applies (override branch)', () => {
  const resolved = resolveModel({ costRoleClass: 'reviewer', modelRequirement: 'Sonnet-class or above.' })
  assert.equal(resolved.tier, 'standard')
  assert.equal(resolved.model, 'Claude Sonnet 5')
  assert.ok(!resolved.accepted.includes('GPT-5.6 Luna'), 'the floor must exclude the economy models')
})

test('resolveModel keeps an implementer at standard when a Sonnet floor applies (no downgrade)', () => {
  const resolved = resolveModel({ costRoleClass: 'implementer', modelRequirement: 'Sonnet-class or above.' })
  assert.equal(resolved.tier, 'standard')
  assert.equal(resolved.model, 'Claude Sonnet 5')
})

test('resolveModel does not lower a planner below frontier despite a Sonnet floor', () => {
  const resolved = resolveModel({ costRoleClass: 'planner', modelRequirement: 'Sonnet-class or above.' })
  assert.equal(resolved.tier, 'frontier')
  assert.equal(resolved.model, 'Claude Sonnet 5')
})
