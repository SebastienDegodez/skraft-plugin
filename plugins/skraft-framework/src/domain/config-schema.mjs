import { Ok, Err } from './result.mjs'

// Pure validation of the repo-wide SKRAFT config (skraft-config.json). No IO.
// Governs where SKRAFT writes, and nothing about how strictly it works: quality is
// not configurable, and `skraft-quality-bar` holds the one permanent bar.
// `difficulty` is intentionally NOT here — it is a per-work-item value that lives in
// state.json (accessed via the state CLI).

// SKRAFT writes state and artefacts under .copilot-tracking/skraft-plans/{slug}/.
// There is one tracking layout. The `trackingLayout` config key is kept for
// round-trip fidelity (existing skraft-config.json files that carry it are preserved
// unchanged) but the value is always coerced to 'namespaced'.
export const TRACKING_LAYOUTS = Object.freeze(['namespaced'])
export const DEFAULT_TRACKING_LAYOUT = 'namespaced'

const isKnownLayout = (value) => TRACKING_LAYOUTS.includes(value)

// Validates (and coerces) the repo-wide config shape. FIDELITY (round-trip): every
// field on the raw object is preserved; trackingLayout is normalized to a known layout
// (unknown / missing / wrong-typed → its default).
// Extra human-authored fields (e.g. teamOwner) pass straight through. A `depthTier`
// left in an older repo's file is one of those now: the dial is gone, so the key is
// no longer governed, and scrubbing someone's file would break the fidelity contract
// this function exists to keep.
export const validateConfig = (raw) => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return Err({ code: 'INVALID_CONFIG', fields: ['config'], reason: 'config must be an object' })
  }

  const coerced = {
    ...raw,
    trackingLayout: isKnownLayout(raw.trackingLayout) ? raw.trackingLayout : DEFAULT_TRACKING_LAYOUT,
  }

  return Ok(Object.freeze(coerced))
}
