import { ModelTier } from './model-tier.mjs'

// cost_role_class → target tier (B12 genesis token-economy).
const CLASS_TIER = Object.freeze({
  reviewer: 'economy',
  implementer: 'standard',
  planner: 'frontier',
})

// tier → concrete model id pinned into agent frontmatter. Bump here when models change.
const TIER_MODEL = Object.freeze({
  economy: 'claude-haiku-4.5',
  standard: 'claude-sonnet-4.5',
  frontier: 'claude-sonnet-4.6',
})

export const tierForClass = (cls) => {
  const tier = CLASS_TIER[cls]
  if (tier === undefined) throw new Error(`Unknown cost_role_class: ${cls}`)
  return ModelTier(tier)
}

export const modelForTier = (tier) => {
  const model = TIER_MODEL[tier.value]
  if (model === undefined) throw new Error(`No model for tier: ${tier.value}`)
  return model
}

// model_requirement is free text; "Sonnet-class or above" raises the floor to standard.
export const floorForRequirement = (requirement) => {
  if (typeof requirement === 'string' && /sonnet-class/i.test(requirement)) {
    return ModelTier('standard')
  }
  return null
}
