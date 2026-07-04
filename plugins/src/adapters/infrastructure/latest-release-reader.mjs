// Outbound adapter: latest published release of the plugin. Pure
// orchestration — store.read → shouldCheck → fetch → store.write. All disk
// access goes through the injected update-check store; every failure path is
// fail-open (ADR-006): the staleness notice is observability, never a gate.
import { shouldCheck } from '../../domain/update-policy.mjs'

export const DEFAULT_REPO = 'SebastienDegodez/skraft-plugin'

export const createLatestReleaseReader = ({
  store,
  frequency,
  fetchImpl = globalThis.fetch,
  clock,
  repo = DEFAULT_REPO,
  timeoutMs = 2000
} = {}) => ({
  // Returns the latest release tag (e.g. "v1.2.0") or null when unknown.
  latestVersion: async () => {
    const known = await store.read()
    const now = clock.now()
    if (!shouldCheck({ frequency, checkedAt: known?.checkedAt, now })) {
      return known?.latestVersion ?? null
    }

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const response = await fetchImpl(`https://api.github.com/repos/${repo}/releases/latest`, {
        signal: controller.signal,
        headers: { accept: 'application/vnd.github+json' }
      })
      clearTimeout(timer)
      if (!response.ok) {
        await store.write({ checkedAt: now, latestVersion: known?.latestVersion ?? null })
        return known?.latestVersion ?? null
      }
      const body = await response.json()
      const latest = body?.tag_name ?? null
      await store.write({ checkedAt: now, latestVersion: latest })
      return latest
    } catch {
      await store.write({ checkedAt: now, latestVersion: known?.latestVersion ?? null })
      return known?.latestVersion ?? null
    }
  }
})
