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

const WINDOW_HOURS = { daily: 24, weekly: 168 }
export const DEFAULT_FREQUENCY = 'daily'

const insideWindow = ({ checkedAt, now, windowHours }) => {
  const ageMs = Date.parse(now) - Date.parse(checkedAt)
  return ageMs >= 0 && ageMs < windowHours * 3_600_000
}

// Deterministic frequency policy deciding whether the update check runs.
// Priority order: never > first run > every_session > time window.
// Unknown frequency falls back to daily; unparseable checkedAt fails open
// to a check (ADR-006: the notice is observability, never a gate).
export const shouldCheck = ({ frequency = DEFAULT_FREQUENCY, checkedAt, now }) => {
  if (frequency === 'never') return false
  if (!checkedAt) return true
  if (frequency === 'every_session') return true
  const windowHours = WINDOW_HOURS[frequency] ?? WINDOW_HOURS[DEFAULT_FREQUENCY]
  return !insideWindow({ checkedAt, now, windowHours })
}

// One line, zero decoration: injected as SessionStart additionalContext.
// Harness-neutral: the same hook fires under Claude Code AND the Copilot
// plugin compat layer; the Claude command is given as an example only.
export const staleNotice = ({ installed, latest }) => {
  const latestClean = String(latest).replace(/^v/, '')
  return `SKRAFT v${latestClean} is available (installed v${installed}) — update the plugin via your harness (e.g. \`claude plugin update skraft\`), then verify with \`node plugins/src/cli/check-freshness-bin.mjs --check\`.`
}
