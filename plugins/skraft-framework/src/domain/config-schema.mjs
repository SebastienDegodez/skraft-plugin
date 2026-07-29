import { Ok, Err } from './result.mjs'

// Pure validation of the repo-wide SKRAFT config (skraft-config.json). No IO.
// Holds the depth-tier dial that governs strictness across every phase of the
// pipeline for THIS repository. `difficulty` is intentionally NOT here — it is a
// per-work-item value that lives in state.json (accessed via the state CLI).

export const DEPTH_TIERS = Object.freeze(['basic', 'standard', 'comprehensive', 'custom'])
export const DEFAULT_DEPTH_TIER = 'comprehensive'

// Where SKRAFT writes its tracking artefacts and state. `namespaced` (default, legacy)
// nests everything under .copilot-tracking/skraft-plans/{slug}/. `bare` converges onto the
// HVE-RPI substrate (.copilot-tracking/{research,plans,details,changes,reviews}/{date}/) so a
// SKRAFT run and an HVE-RPI run are drop-in swappable on the same files; SKRAFT state then
// lives under the dedicated control dir .copilot-tracking/skraft/{slug}/ which RPI ignores.
export const TRACKING_LAYOUTS = Object.freeze(['namespaced', 'bare'])
export const DEFAULT_TRACKING_LAYOUT = 'namespaced'

const isKnownTier = (value) => DEPTH_TIERS.includes(value)
const isKnownLayout = (value) => TRACKING_LAYOUTS.includes(value)

// Validates (and coerces) the repo-wide config shape. FIDELITY (round-trip): every
// field on the raw object is preserved; depthTier is normalized to a known tier and
// trackingLayout to a known layout (unknown / missing / wrong-typed → their defaults).
// Extra human-authored fields (e.g. depthTierRationale, teamOwner) pass straight through.
export const validateConfig = (raw) => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return Err({ code: 'INVALID_CONFIG', fields: ['config'], reason: 'config must be an object' })
  }

  const coerced = {
    ...raw,
    depthTier: isKnownTier(raw.depthTier) ? raw.depthTier : DEFAULT_DEPTH_TIER,
    trackingLayout: isKnownLayout(raw.trackingLayout) ? raw.trackingLayout : DEFAULT_TRACKING_LAYOUT,
  }

  return Ok(Object.freeze(coerced))
}
