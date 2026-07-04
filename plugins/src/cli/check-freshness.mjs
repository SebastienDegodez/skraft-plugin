import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { parseYaml } from '../../../scripts/lib/book.mjs'
import { ciGateMarkers } from '../../../scripts/lib/ci-gates.mjs'
import {
  checkVersionSync,
  checkHooksParity,
  checkCiParity,
  hasBlockingFinding
} from '../domain/freshness-policy.mjs'
import { isStale } from '../domain/update-policy.mjs'
import { SUPPORTED_HOOK_TYPES } from '../adapters/api/hooks/hook-router.mjs'

// S7 deterministic tool bridge: the CLI-ensemble freshness gate.
// Master version = plugins/.claude-plugin/plugin.json; every other distribution
// surface (package.json, apm.yml, generated config provenance) must match it.
// hooks.json may only declare hook types the router can route, and every local
// CI gate must have a matching step in the CI workflow.

const readJson = (path) => {
  if (!existsSync(path)) return null
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}

const readText = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '')

const collectFindings = (root) => {
  const pluginManifest = readJson(join(root, 'plugins/.claude-plugin/plugin.json'))
  const packageJson = readJson(join(root, 'plugins/src/package.json'))
  const apm = existsSync(join(root, 'apm.yml')) ? parseYaml(readText(join(root, 'apm.yml'))) : null
  const config = readJson(join(root, 'plugins/skraft-framework.config.json'))
  const hooksManifest = readJson(join(root, 'plugins/hooks/hooks.json'))
  const workflowText = readText(join(root, '.github/workflows/skraft-framework-ci.yml'))

  return [
    ...checkVersionSync({
      master: { source: 'plugins/.claude-plugin/plugin.json', version: pluginManifest?.version },
      others: [
        { source: 'plugins/src/package.json', version: packageJson?.version },
        { source: 'apm.yml', version: apm?.version == null ? undefined : String(apm.version) },
        { source: 'plugins/skraft-framework.config.json (_meta.generatorVersion)', version: config?._meta?.generatorVersion }
      ]
    }),
    ...checkHooksParity({
      declared: Object.keys(hooksManifest?.hooks ?? {}),
      supported: SUPPORTED_HOOK_TYPES
    }),
    ...checkCiParity({ markers: ciGateMarkers(), workflowText })
  ]
}

export const main = (argv, { log = console.log, error = console.error } = {}) => {
  const { values } = parseArgs({
    args: argv,
    options: {
      check: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      root: { type: 'string', default: '.' }
    }
  })

  const findings = collectFindings(values.root)
  const ok = !hasBlockingFinding(findings)

  for (const f of findings) {
    error(`${f.code} [${f.severity}] ${f.source}: ${f.message}`)
  }

  if (values.json) {
    log(JSON.stringify({ ok, findings }, null, 2))
  } else if (ok) {
    log('CLI ensemble is fresh (versions, hooks routing, CI parity)')
  } else {
    error('freshness drift detected — align versions/hooks/CI before shipping')
  }

  return ok ? 0 : 1
}

// Cross-harness staleness check (`--remote`): the SessionStart notice only
// exists inside Claude Code; Copilot/Cursor users invoke this manually.
// Always exit 0 — staleness is observability, never a gate (ADR-006).
export const remoteMain = async ({ installedVersion, releaseReader, json = false }, { log = console.log } = {}) => {
  let latest = null
  try { latest = await releaseReader.latestVersion() } catch { /* fail-open */ }

  const stale = isStale({ installed: installedVersion, latest })

  if (json) {
    log(JSON.stringify({ installed: installedVersion ?? null, latest, stale }, null, 2))
    return 0
  }

  if (latest === null) {
    log('latest release unknown (offline or no release yet) — could not compare')
  } else if (stale) {
    log(`update available: v${String(latest).replace(/^v/, '')} (installed v${installedVersion}) — update the skraft plugin via your harness, then run --check`)
  } else {
    log(`skraft is up to date (v${installedVersion})`)
  }
  return 0
}
