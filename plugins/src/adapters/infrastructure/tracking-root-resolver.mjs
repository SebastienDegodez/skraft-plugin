import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stateBaseSegments, resolveTrackingLayout } from '../../domain/tracking-layout-policy.mjs'

// Composition-root resolver for the SKRAFT state base path. Mirrors the plugin-root
// resolver style: an infrastructure adapter that reads env + disk, delegating the pure
// segment mapping to domain/tracking-layout-policy. Used by cli/state.mjs and cli/hook.mjs
// so both find state.json in the same place.
//
// Precedence:
//   1. SKRAFT_TRACKING_ROOT  — an explicit, absolute base path. Wins outright (back-compat;
//      the tests and any custom deployment set this).
//   2. SKRAFT_TRACKING_LAYOUT (namespaced|bare) — env override of the layout dial.
//   3. skraft-config.json::trackingLayout at SKRAFT_CONFIG_ROOT|cwd — the repo-wide P2 flag.
//   4. default namespaced (legacy) — existing repos are unchanged.
//
// Fail-open: any error reading the config file (ENOENT, corrupt) falls back to the default
// layout — resolving the tracking root must never throw.
export const resolveTrackingRoot = ({ env = process.env, cwd = process.cwd() } = {}) => {
  if (env.SKRAFT_TRACKING_ROOT) return env.SKRAFT_TRACKING_ROOT

  let layout = env.SKRAFT_TRACKING_LAYOUT
  if (!layout) {
    try {
      const cfgPath = join(env.SKRAFT_CONFIG_ROOT ?? cwd, 'skraft-config.json')
      const parsed = JSON.parse(readFileSync(cfgPath, 'utf8'))
      layout = parsed?.trackingLayout
    } catch {
      /* no config / unreadable / corrupt → default layout */
    }
  }

  return join(cwd, ...stateBaseSegments(resolveTrackingLayout(layout)))
}
