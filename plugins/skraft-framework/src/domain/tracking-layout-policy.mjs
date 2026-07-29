import { TRACKING_LAYOUTS, DEFAULT_TRACKING_LAYOUT } from './config-schema.mjs'

// Pure policy for locating SKRAFT pipeline state on disk under either tracking layout.
// No IO, no node:path — returns PATH SEGMENTS (relative to the workspace root); the
// infrastructure adapter joins them for the host platform.
//
// namespaced (default, legacy): state at .copilot-tracking/skraft-plans/{slug}/state.json.
// bare (HVE-RPI convergence):    state at .copilot-tracking/skraft/{slug}/state.json — a
//   dedicated SKRAFT control dir that HVE-RPI ignores, while the phase ARTEFACTS converge
//   onto the bare RPI dirs (research/, plans/, details/, changes/, reviews/). Artefact
//   placement is the agents' concern (skraft-artifacts convention), not this policy's.

export const resolveTrackingLayout = (raw) =>
  TRACKING_LAYOUTS.includes(raw) ? raw : DEFAULT_TRACKING_LAYOUT

// Segments of the base directory that holds every project's {slug}/state.json.
export const stateBaseSegments = (layout) =>
  resolveTrackingLayout(layout) === 'bare'
    ? ['.copilot-tracking', 'skraft']
    : ['.copilot-tracking', 'skraft-plans']

// Segments of one project's state directory for a layout: <base>/<slug>.
export const stateDirSegments = (layout, slug) => [...stateBaseSegments(layout), slug]
