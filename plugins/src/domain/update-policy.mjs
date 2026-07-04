// Pure domain: plugin update staleness policy. No IO, no network.
// The SessionStart hook uses it to decide (a) whether the daily cache is due
// for refresh, (b) whether the installed plugin lags the latest release, and
// (c) the exact one-line notice to inject. Fail-open: unknown latest = fresh.

const parts = (version) =>
  String(version).replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10) || 0)

export const compareSemver = (a, b) => {
  const [aMaj, aMin, aPat] = parts(a)
  const [bMaj, bMin, bPat] = parts(b)
  if (aMaj !== bMaj) return aMaj < bMaj ? -1 : 1
  if (aMin !== bMin) return aMin < bMin ? -1 : 1
  if (aPat !== bPat) return aPat < bPat ? -1 : 1
  return 0
}

// Unknown latest (network failed, no cache) NEVER reports stale — the notice
// is best-effort observability, not a gate (ADR-006 fail-open).
export const isStale = ({ installed, latest }) => {
  if (!installed || !latest) return false
  return compareSemver(installed, latest) < 0
}

export const DEFAULT_TTL_HOURS = 24

export const shouldRefreshCache = ({ checkedAt, now, ttlHours = DEFAULT_TTL_HOURS }) => {
  if (!checkedAt) return true
  const ageMs = Date.parse(now) - Date.parse(checkedAt)
  return !(ageMs >= 0 && ageMs < ttlHours * 3_600_000)
}

// One line, zero decoration: injected as SessionStart additionalContext.
export const staleNotice = ({ installed, latest }) => {
  const latestClean = String(latest).replace(/^v/, '')
  return `SKRAFT v${latestClean} is available (installed v${installed}) — run \`claude plugin update skraft\`, then verify with \`node plugins/src/cli/check-freshness-bin.mjs --check\`.`
}
