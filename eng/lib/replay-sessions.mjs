// Pure naming and retention rules for AGENTVIZ replay sessions.
//
// AGENTVIZ (https://github.com/jayparikh/agentviz) replays a Vally trial's raw
// trajectory. It reads a static manifest of named, tagged sessions, so the value
// of this module is entirely in the names and tags: a reader must be able to
// tell, from the session list alone, which skill and scenario a run belongs to
// and whether it was the baseline or the skilled variant.

/** Vally variant → the role tag a reader filters on in AGENTVIZ. */
export const ROLE_BY_VARIANT = { baseline: 'baseline', skilled: 'skilled' }

/**
 * The variant a recorded trial belongs to, read back from where it was written.
 *
 * Vally may stamp the generic `main` variant for two isolated `vally eval`
 * runs. The reliable evidence is the directory the runner pointed
 * `--output-dir` at. Without this, both passes tag as `main` and the replay
 * loses the one distinction that makes it worth reading: baseline against
 * skilled.
 *
 * @param {string} path any path inside the run's output directory
 * @returns {string} the variant, or an empty string when the path carries none
 */
export function variantFromPath(path) {
  const segments = String(path ?? '')
    .split('\\')
    .join('/')
    .split('/')
  return segments.findLast((segment) => Object.hasOwn(ROLE_BY_VARIANT, segment)) ?? ''
}

/** Filesystem- and URL-safe slug. */
export function slug(value) {
  const cleaned = String(value ?? '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
  return cleaned || 'unnamed'
}

/** tests/skills/<skill>/eval.yaml → <skill>. */
export function skillOf(evalFile) {
  const segments = String(evalFile ?? '')
    .split('\\')
    .join('/')
    .replace(/\/eval\.ya?ml$/, '')
    .split('/')
    .filter(Boolean)
  return segments.at(-1) ?? 'unknown'
}

/** Where a run's sessions live, relative to the replay data root. */
export function sessionSubDirectory({ source, prNumber = 0, date }) {
  return source === 'pr' ? `pr/${prNumber}` : `scheduled/${date}`
}

/**
 * Manifest entry for one recorded trial.
 * @param {object} input trial identity and placement
 */
export function sessionEntry({ skill, stimulusName, role, trialIndex, fileName, subDirectory, source, prNumber = 0, date, mtime }) {
  const scenario = slug(stimulusName || skill)
  const tags = [source, skill, role, scenario]
  if (source === 'pr' && prNumber > 0) tags.push(`pr-${prNumber}`)
  if (source === 'scheduled') tags.push(date)

  return {
    id: `${subDirectory}/${skill}/${fileName.replace(/\.jsonl$/, '')}`,
    name: `${skill} / ${stimulusName || scenario} (${role}, run ${trialIndex})`,
    url: `sessions/${subDirectory}/${skill}/${fileName}`,
    tags,
    mtime,
  }
}

/**
 * Scheduled session directories to drop, keeping the newest `retentionDays`.
 * Pull-request directories are never purged by age — they are removed when the
 * pull request closes.
 * @param {string[]} dateDirectories directory names shaped YYYY-MM-DD
 * @param {number} retentionDays how many distinct days to keep
 */
export function expiredScheduledDates(dateDirectories, retentionDays) {
  const dates = dateDirectories.filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name)).sort()
  return dates.slice(0, Math.max(0, dates.length - Math.max(0, retentionDays)))
}
