// Model tiers on a short leash, ordered by cost/capability rank.
const TIER_RANK = Object.freeze({ economy: 0, standard: 1, frontier: 2 })

// Each tier carries its rank so callers can compare without knowing the order.
export const ModelTier = (name) => {
  if (!Object.prototype.hasOwnProperty.call(TIER_RANK, name)) {
    throw new Error(`Invalid model tier: ${name}`)
  }
  return Object.freeze({ type: 'ModelTier', value: name, rank: TIER_RANK[name] })
}

// Higher rank wins — the more capable (more expensive) tier.
export const maxTier = (a, b) => (a.rank >= b.rank ? a : b)
