// Pure observability policy (US12). No IO. Governs three deterministic signals:
//   1. resolveObservabilityConfig — merge the repo `observability` block over defaults.
//   2. detectStalePhase — flag a phase that has been IN_PROGRESS too long (fail-open).
//   3. planAuditRetention / planStaleSignals — housekeeping: what to purge given the
//      configured retention windows.
// The thresholds live in skraft-config.json under an `observability` block (edited
// directly, like the other extra repo-config fields); missing/invalid values fall
// back to DEFAULT_OBSERVABILITY so callers always get a usable config.

export const HOUR_MS = 60 * 60 * 1000
export const DAY_MS = 24 * HOUR_MS

export const DEFAULT_OBSERVABILITY = Object.freeze({
  stalePhaseHours: 24,
  auditRetentionDays: 30,
  signalRetentionDays: 14,
})

// Positive finite number or the fallback. Guards every threshold against
// negatives, zero, NaN, strings and missing values.
const positiveNumber = (value, fallback) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

// Merge the raw repo config's `observability` block over the defaults. Every bad or
// missing threshold is coerced to its default, so the result is always complete.
export const resolveObservabilityConfig = (raw) => {
  const block = isPlainObject(raw) && isPlainObject(raw.observability) ? raw.observability : {}
  return Object.freeze({
    stalePhaseHours: positiveNumber(block.stalePhaseHours, DEFAULT_OBSERVABILITY.stalePhaseHours),
    auditRetentionDays: positiveNumber(block.auditRetentionDays, DEFAULT_OBSERVABILITY.auditRetentionDays),
    signalRetentionDays: positiveNumber(block.signalRetentionDays, DEFAULT_OBSERVABILITY.signalRetentionDays),
  })
}

// Fail-open stale-phase detection. NEVER throws. An unknown/undatable last-update
// yields level 'unknown' (not a warning) so a missing timestamp can never falsely
// alarm nor block the pipeline.
//   level: 'ok'      — within the threshold
//          'warn'    — IN_PROGRESS longer than the configured window
//          'unknown' — no usable timestamp to judge age
export const detectStalePhase = ({ currentPhase, lastUpdatedMs, nowMs, stalePhaseHours }) => {
  const thresholdMs = positiveNumber(stalePhaseHours, DEFAULT_OBSERVABILITY.stalePhaseHours) * HOUR_MS
  const phase = typeof currentPhase === 'string' && currentPhase.length > 0 ? currentPhase : null

  if (
    typeof lastUpdatedMs !== 'number' || !Number.isFinite(lastUpdatedMs) ||
    typeof nowMs !== 'number' || !Number.isFinite(nowMs)
  ) {
    return { level: 'unknown', phase, ageMs: null, thresholdMs }
  }

  const ageMs = Math.max(0, nowMs - lastUpdatedMs)
  if (ageMs > thresholdMs) {
    const ageHours = Math.round(ageMs / HOUR_MS)
    const thresholdHours = Math.round(thresholdMs / HOUR_MS)
    return {
      level: 'warn',
      phase,
      ageMs,
      thresholdMs,
      message: `phase ${phase ?? '?'} in progress for ${ageHours}h (threshold ${thresholdHours}h)`,
    }
  }
  return { level: 'ok', phase, ageMs, thresholdMs }
}

// Parse the ISO/epoch timestamp out of one audit JSONL line. Returns epoch ms or
// null when the line is not datable (unparseable JSON, or no timestamp field).
const parseLineTimestamp = (line) => {
  let obj
  try {
    obj = JSON.parse(line)
  } catch {
    return null
  }
  if (obj === null || typeof obj !== 'object') return null
  const t = obj.timestamp ?? obj.ts
  if (typeof t === 'number' && Number.isFinite(t)) return t
  if (typeof t === 'string') {
    const ms = Date.parse(t)
    return Number.isNaN(ms) ? null : ms
  }
  return null
}

// Split audit JSONL lines into kept vs purged given a retention window. A line is
// purged only when it has a parseable timestamp OLDER than the cutoff. Blank lines
// are dropped silently; undatable lines are KEPT (fail-open — never lose a record
// we cannot confidently age out).
export const planAuditRetention = ({ lines, nowMs, retentionDays }) => {
  const retentionMs = positiveNumber(retentionDays, DEFAULT_OBSERVABILITY.auditRetentionDays) * DAY_MS
  const cutoff = (typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : Date.now()) - retentionMs
  const kept = []
  let purged = 0
  for (const line of Array.isArray(lines) ? lines : []) {
    if (typeof line !== 'string' || line.trim() === '') continue
    const ts = parseLineTimestamp(line)
    if (ts !== null && ts < cutoff) {
      purged += 1
      continue
    }
    kept.push(line)
  }
  return { kept, purged }
}

// Given [{ name, mtimeMs }] signal files (state backups / corrupted snapshots),
// return the names whose mtime is older than the retention window. Entries without
// a usable mtime are never purged.
export const planStaleSignals = ({ entries, nowMs, retentionDays }) => {
  const retentionMs = positiveNumber(retentionDays, DEFAULT_OBSERVABILITY.signalRetentionDays) * DAY_MS
  const cutoff = (typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : Date.now()) - retentionMs
  const purge = []
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry && typeof entry.name === 'string' && typeof entry.mtimeMs === 'number' && Number.isFinite(entry.mtimeMs) && entry.mtimeMs < cutoff) {
      purge.push(entry.name)
    }
  }
  return { purge }
}

// Recognizes the transient state artifacts housekeeping is allowed to purge:
// rotated backups (state.json.bak.<ts>) and corruption snapshots
// (state.json.corrupted.<ts>). The live state.json is never matched.
export const isStaleSignalFile = (name) =>
  typeof name === 'string' &&
  (/^state\.json\.bak\.\d+$/.test(name) || /^state\.json\.corrupted\.\d+$/.test(name))
