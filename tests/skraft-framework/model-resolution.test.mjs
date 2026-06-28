import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ModelTier, maxTier } from '../../plugins/src/domain/model-tier.mjs'
import {
  tierForClass,
  modelForTier,
  floorForRequirement,
} from '../../plugins/src/domain/model-class-policy.mjs'
import { resolveModel } from '../../plugins/src/application/resolve-model.mjs'

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

test('tierForClass maps the three B12 classes', () => {
  assert.equal(tierForClass('reviewer').value, 'economy')
  assert.equal(tierForClass('implementer').value, 'standard')
  assert.equal(tierForClass('planner').value, 'frontier')
})

test('tierForClass rejects an unknown class', () => {
  assert.throws(() => tierForClass('architect'), /Unknown cost_role_class: architect/)
})

test('modelForTier maps each tier to its concrete model', () => {
  assert.equal(modelForTier(ModelTier('economy')), 'claude-haiku-4.5')
  assert.equal(modelForTier(ModelTier('standard')), 'claude-sonnet-4.6')
  assert.equal(modelForTier(ModelTier('frontier')), 'claude-sonnet-4.6')
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
  assert.deepEqual(resolveModel({ costRoleClass: 'reviewer' }), {
    tier: 'economy',
    model: 'claude-haiku-4.5',
  })
})

test('resolveModel maps an implementer to standard', () => {
  assert.deepEqual(resolveModel({ costRoleClass: 'implementer' }), {
    tier: 'standard',
    model: 'claude-sonnet-4.6',
  })
})

test('resolveModel maps a planner to frontier', () => {
  assert.deepEqual(resolveModel({ costRoleClass: 'planner' }), {
    tier: 'frontier',
    model: 'claude-sonnet-4.6',
  })
})

test('resolveModel raises a reviewer to standard when a Sonnet floor applies (override branch)', () => {
  assert.deepEqual(
    resolveModel({ costRoleClass: 'reviewer', modelRequirement: 'Sonnet-class or above.' }),
    { tier: 'standard', model: 'claude-sonnet-4.6' },
  )
})

test('resolveModel keeps an implementer at standard when a Sonnet floor applies (no downgrade)', () => {
  assert.deepEqual(
    resolveModel({ costRoleClass: 'implementer', modelRequirement: 'Sonnet-class or above.' }),
    { tier: 'standard', model: 'claude-sonnet-4.6' },
  )
})

test('resolveModel does not lower a planner below frontier despite a Sonnet floor', () => {
  assert.deepEqual(
    resolveModel({ costRoleClass: 'planner', modelRequirement: 'Sonnet-class or above.' }),
    { tier: 'frontier', model: 'claude-sonnet-4.6' },
  )
})
