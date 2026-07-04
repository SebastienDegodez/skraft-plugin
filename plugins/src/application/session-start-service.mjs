// Application service: SessionStart staleness notice.
// Compares the installed plugin version against the latest published release
// (via the injected reader, itself daily-cached) and injects ONE line of
// additionalContext when an update is available. Silent in every other case,
// including reader failure — fail-open per ADR-006, never blocks a session.
import { isStale, staleNotice } from '../domain/update-policy.mjs'

export const createSessionStartService = ({ releaseReader, installedVersion } = {}) => ({
  handle: async () => {
    let latest = null
    try { latest = await releaseReader.latestVersion() } catch { return undefined }

    if (!isStale({ installed: installedVersion, latest })) return undefined

    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: staleNotice({ installed: installedVersion, latest })
      }
    }
  }
})
