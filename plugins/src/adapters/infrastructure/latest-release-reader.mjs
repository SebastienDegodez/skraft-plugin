// Outbound adapter: latest published release of the plugin, with a daily
// on-disk cache. Every failure path is fail-open (ADR-006): the staleness
// notice is observability, never a gate — worst case the notice is absent.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { shouldRefreshCache } from '../../domain/update-policy.mjs'

export const DEFAULT_REPO = 'SebastienDegodez/skraft-plugin'

export const createLatestReleaseReader = ({
  cachePath,
  fetchImpl = globalThis.fetch,
  clock,
  repo = DEFAULT_REPO,
  timeoutMs = 2000,
  ttlHours
} = {}) => {
  const readCache = () => {
    try { return JSON.parse(readFileSync(cachePath, 'utf8')) } catch { return null }
  }

  const writeCache = (data) => {
    try {
      mkdirSync(dirname(cachePath), { recursive: true })
      writeFileSync(cachePath, JSON.stringify(data) + '\n')
    } catch { /* fail-open: cache is best-effort */ }
  }

  return {
    // Returns the latest release tag (e.g. "v1.2.0") or null when unknown.
    latestVersion: async () => {
      const cache = readCache()
      const now = clock.now()
      if (cache && !shouldRefreshCache({ checkedAt: cache.checkedAt, now, ttlHours })) {
        return cache.latestVersion ?? null
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
          writeCache({ checkedAt: now, latestVersion: cache?.latestVersion ?? null })
          return cache?.latestVersion ?? null
        }
        const body = await response.json()
        const latest = body?.tag_name ?? null
        writeCache({ checkedAt: now, latestVersion: latest })
        return latest
      } catch {
        writeCache({ checkedAt: now, latestVersion: cache?.latestVersion ?? null })
        return cache?.latestVersion ?? null
      }
    }
  }
}
