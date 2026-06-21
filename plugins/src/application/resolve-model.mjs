import { maxTier } from '../domain/model-tier.mjs'
import { tierForClass, modelForTier, floorForRequirement } from '../domain/model-class-policy.mjs'

// Resolve the concrete model: the class target raised to any model_requirement floor.
export const resolveModel = ({ costRoleClass, modelRequirement } = {}) => {
  const classTier = tierForClass(costRoleClass)
  const floor = floorForRequirement(modelRequirement)
  const tier = floor === null ? classTier : maxTier(classTier, floor)
  return { tier: tier.value, model: modelForTier(tier) }
}
