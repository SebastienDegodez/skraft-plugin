import { maxTier } from '../domain/model-tier.mjs'
import { tierForClass, modelForTier, modelsForTier, floorForRequirement } from '../domain/model-class-policy.mjs'

// Resolve the concrete model: the class target raised to any model_requirement floor.
// `model` is what to pin when nothing acceptable is there yet; `accepted` is the full set
// that satisfies the tier, so a compliant agent is left alone.
export const resolveModel = ({ costRoleClass, modelRequirement } = {}) => {
  const classTier = tierForClass(costRoleClass)
  const floor = floorForRequirement(modelRequirement)
  const tier = floor === null ? classTier : maxTier(classTier, floor)
  return { tier: tier.value, model: modelForTier(tier), accepted: modelsForTier(tier) }
}
