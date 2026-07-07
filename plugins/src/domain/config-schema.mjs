import { Ok, Err } from './result.mjs'

// Pure validation of the repo-wide SKRAFT config (skraft-config.json). No IO.
// Holds the depth-tier dial that governs strictness across every phase of the
// pipeline for THIS repository. `difficulty` is intentionally NOT here — it is a
// per-work-item value that lives in state.json (accessed via the state CLI).

export const DEPTH_TIERS = Object.freeze(['basic', 'standard', 'comprehensive', 'custom'])
export const DEFAULT_DEPTH_TIER = 'comprehensive'

const isKnownTier = (value) => DEPTH_TIERS.includes(value)

// Validates (and coerces) the repo-wide config shape. FIDELITY (round-trip): every
// field on the raw object is preserved; only depthTier is normalized to a known tier
// (unknown / missing / wrong-typed → comprehensive default). Extra human-authored
// fields (e.g. depthTierRationale, teamOwner) pass straight through.
export const validateConfig = (raw) => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return Err({ code: 'INVALID_CONFIG', fields: ['config'], reason: 'config must be an object' })
  }

  const coerced = {
    ...raw,
    depthTier: isKnownTier(raw.depthTier) ? raw.depthTier : DEFAULT_DEPTH_TIER,
  }

  return Ok(Object.freeze(coerced))
}
