import { ModelTier } from './model-tier.mjs'

// cost_role_class → target tier (B12 genesis token-economy).
const CLASS_TIER = Object.freeze({
  reviewer: 'economy',
  implementer: 'standard',
  researcher: 'standard',
  planner: 'frontier',
})

// tier → the models ACCEPTED for that tier, PREFERRED FIRST.
//
// `--apply` pins the preferred entry into an agent that sits on none of them; `--check`
// accepts any entry. That distinction is the point: an agent already running an accepted
// model is never rewritten just because the preference at the head of the list moved, so
// changing a preference does not sweep the whole catalogue into one vendor.
//
// Each family is listed in the forms a harness may present it under — plain display name,
// Copilot-suffixed display name, and API id — because the same model reaches the shipped
// frontmatter and the evaluation runner under different spellings.
const TIER_MODELS = Object.freeze({
  economy: Object.freeze([
    'GPT-5.6 Luna',
    'GPT-5.6 Luna (copilot)',
    'gpt-5.6-luna',
    'Claude Haiku 4.5',
    'Claude Haiku 4.5 (copilot)',
  ]),
  standard: Object.freeze([
    'Claude Sonnet 5',
    'Claude Sonnet 5 (copilot)',
    'claude-sonnet-5',
  ]),
  frontier: Object.freeze([
    'Claude Sonnet 5',
    'Claude Sonnet 5 (copilot)',
    'claude-sonnet-5',
  ]),
})

export const tierForClass = (cls) => {
  const tier = CLASS_TIER[cls]
  if (tier === undefined) throw new Error(`Unknown cost_role_class: ${cls}`)
  return ModelTier(tier)
}

export const modelsForTier = (tier) => {
  const models = TIER_MODELS[tier.value]
  if (models === undefined) throw new Error(`No model for tier: ${tier.value}`)
  return models
}

export const modelForTier = (tier) => modelsForTier(tier)[0]

// model_requirement is free text; "Sonnet-class or above" raises the floor to standard.
export const floorForRequirement = (requirement) => {
  if (typeof requirement === 'string' && /sonnet-class/i.test(requirement)) {
    return ModelTier('standard')
  }
  return null
}
