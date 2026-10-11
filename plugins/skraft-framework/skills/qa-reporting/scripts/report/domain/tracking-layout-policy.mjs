import { TRACKING_LAYOUTS, DEFAULT_TRACKING_LAYOUT } from './config-schema.mjs'

// Pure policy for locating SKRAFT pipeline state on disk.
// No IO, no node:path — returns PATH SEGMENTS (relative to the workspace root); the
// infrastructure adapter joins them for the host platform.
//
// One layout: state at .copilot-tracking/skraft-plans/{slug}/state.json.
// The `layout` parameter is accepted for back-compat but always resolves to 'namespaced'.

export const resolveTrackingLayout = (raw) =>
  TRACKING_LAYOUTS.includes(raw) ? raw : DEFAULT_TRACKING_LAYOUT

// Segments of the base directory that holds every project's {slug}/state.json.
// Always .copilot-tracking/skraft-plans regardless of the layout argument.
export const stateBaseSegments = (_layout) => ['.copilot-tracking', 'skraft-plans']

// Segments of one project's state directory: <base>/<slug>.
export const stateDirSegments = (layout, slug) => [...stateBaseSegments(layout), slug]
