import { parseOutputEntry } from '../phase-gate-policy.mjs'
import { artifactPatternToRegExp } from '../artifact-policy.mjs'

// Pure: which tracked files an agent must leave, and which of them it left.
// Patterns come from the published config (agentArtifacts.<agent>.outputs).

const TRACKING_PREFIX = /^\.copilot-tracking\/skraft-plans\/\{projectSlug\}\//

// Tracking-relative output patterns an agent writes, each { pattern, optional }.
export const expectedTrackedOutputs = (agent, config) =>
  (config?.agentArtifacts?.[agent]?.outputs ?? [])
    .map(parseOutputEntry)
    .filter((entry) => entry && TRACKING_PREFIX.test(entry.pattern))
    .map((entry) => Object.freeze({ pattern: entry.pattern.replace(TRACKING_PREFIX, ''), optional: entry.optional }))

// files — every tracking-relative file on disk. found: the files matching a pattern
// (sorted, unique); missing: the required patterns nothing matched.
export const matchOutputs = (files, expectations) => {
  const found = new Set()
  const missing = []
  for (const { pattern, optional } of expectations) {
    const re = artifactPatternToRegExp(pattern)
    const matches = files.filter((file) => re.test(file))
    matches.forEach((file) => found.add(file))
    if (matches.length === 0 && !optional) missing.push(pattern)
  }
  return Object.freeze({ found: [...found].sort(), missing })
}

// The quality-gate evidence log among recorded paths: evidence/{date}/{story}/qg-{story}.json,
// the latest by path when several were recorded.
export const latestEvidenceLog = (paths) =>
  paths.filter((path) => /(^|\/)qg-[^/]+\.json$/.test(path)).sort().at(-1) ?? null

// The structural scan DESIGN reads, recorded under RESEARCH once per pipeline.
export const structuralScanPath = (date) => `details/${date}/structural-scan.json`
export const hasStructuralScan = (state) =>
  (state?.phaseArtifacts?.RESEARCH ?? []).some((path) => path.endsWith('structural-scan.json'))
