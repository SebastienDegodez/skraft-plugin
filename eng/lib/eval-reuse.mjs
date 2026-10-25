// Pure rules behind skipping a pre-merge evaluation whose inputs did not move.
//
// A PR evaluates every subject whose AI content differs from the base, so each
// new push would re-run real-model evaluations for subjects the push never
// touched. The fingerprint below hashes a subject's AI content only — the same
// files that select it (eng/lib/changed-skills.mjs): its skill directory and
// companion skills, the descriptors of the agents a suite exercises, its eval
// spec folder and the files its spec stages — from git blobs. Tooling, the
// pinned toolchain and the models never invalidate a carried cell on a PR;
// scheduled and dispatched runs measure every subject afresh.
import { createHash } from 'node:crypto'
import { posix } from 'node:path'

import { subjectContent } from './changed-skills.mjs'
import { verdictState } from './verdict.mjs'

const FINGERPRINT_VERSION = 'skraft-eval-fingerprint/2'

/**
 * `git ls-tree -r <rev>` output as entries. The blob id stands for the content,
 * so hashing the listing hashes the files without reading them.
 *
 * @param {string} text
 * @returns {Array<{ mode: string, blob: string, path: string }>}
 */
export function parseTree(text) {
  return String(text ?? '')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [meta, path] = line.split('\t')
      const [mode, , blob] = meta.split(' ')
      return { mode, blob, path }
    })
}

/**
 * The companion skills an `eval.skill-dir.yaml` mounts, read the way the runner
 * reads them: the `- name` items under `skills:`, comments skipped, the list
 * ending at the next key.
 *
 * @param {string} text sidecar content, empty when there is none
 * @returns {string[]}
 */
export function parseCompanions(text) {
  const names = []
  let inSkills = false
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue
    if (/^\s*skills:\s*$/.test(line)) inSkills = true
    else if (inSkills && /^\s*-\s*[A-Za-z0-9-]+\s*$/.test(line)) names.push(line.replace(/^\s*-\s*/, '').trim())
    else if (inSkills && /^\s*[A-Za-z0-9_-]+:\s*$/.test(line)) inSkills = false
  }
  return names
}

const collectSources = (node, found) => {
  if (Array.isArray(node)) node.forEach((child) => collectSources(child, found))
  else if (node && typeof node === 'object') {
    if (typeof node.src === 'string') found.push(node.src)
    Object.values(node).forEach((child) => collectSources(child, found))
  }
  return found
}

/**
 * Every source a spec stages into a run, as repository paths. A stimulus may
 * stage a file from outside its spec folder (`src: ../../../scripts/x.mjs`);
 * that file is an input of the subject like its own fixtures. A source that
 * resolves outside the repository is left out: no commit can change it.
 *
 * @param {unknown} spec the parsed eval spec
 * @param {string} specDir the spec folder, repository-relative, e.g. `tests/agents/<suite>`
 * @returns {string[]} sorted, unique, without a trailing slash
 */
export function stagedSources(spec, specDir) {
  const paths = collectSources(spec, [])
    .map((src) => posix.normalize(posix.join(specDir, src)).replace(/\/+$/, ''))
    .filter((path) => path !== '..' && !path.startsWith('../') && !posix.isAbsolute(path))
  return [...new Set(paths)].sort()
}

/** The key a subject is recorded under: a skill and a suite may share a name. */
export const subjectKey = ({ kind, name }) => `${kind}:${name}`

/**
 * The content hash of a subject's AI content.
 *
 * @param {{ kind: 'skill' | 'agent', name: string, args?: string }} subject
 * @param {{ tree: Array<{ mode: string, blob: string, path: string }>, companions?: string[], staged?: string[], agents?: string[] | null }} inputs
 *   `agents`: the agent ids a suite exercises, null or absent when unknown
 * @returns {string} `sha256:<hex>`
 */
export function subjectFingerprint(subject, { tree, companions = [], staged = [], agents }) {
  const sources = subjectContent(subject, { companions, staged, agents })
  const files = tree
    .filter(({ path }) => sources.some((pattern) => pattern.test(path)))
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
    .map(({ mode, blob, path }) => `${mode} ${blob}\t${path}`)
  const lines = [
    FINGERPRINT_VERSION,
    subjectKey(subject),
    `args=${subject.args ?? ''}`,
    `companions=${[...companions].sort().join(',')}`,
    `agents=${Array.isArray(agents) ? [...agents].sort().join(',') : '*'}`,
    ...files,
  ]
  return `sha256:${createHash('sha256').update(lines.join('\n')).digest('hex')}`
}

const LEDGER_VERSION = 1

const subjectsOf = (ledger) =>
  ledger?.schemaVersion === LEDGER_VERSION && ledger.subjects && typeof ledger.subjects === 'object' ? ledger.subjects : {}

// A carried cell keeps the date of the run that measured it; past this age the
// subject is measured again even when nothing it reads moved.
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

const recentEnough = (from, now) => {
  const measured = Date.parse(from?.measuredAt ?? '')
  return Number.isFinite(measured) && now.getTime() - measured <= MAX_AGE_MS
}

/**
 * Which planned subjects still have to run, and which can carry the cell of the
 * PR's latest evaluation because their fingerprint did not move since. A re-run
 * of the workflow is a deliberate re-roll and reuses nothing. Anything
 * unreadable — no ledger, another schema, no fingerprint, no date — runs, and so
 * does a cell measured more than 14 days ago.
 *
 * @param {{ include: Array<{ kind: 'skill' | 'agent', name: string }>, fingerprints: Record<string, string>, ledger?: unknown, now: Date, rerun?: boolean }} plan
 * @returns {{ run: object[], reused: object[] }}
 */
export function planReuse({ include, fingerprints, ledger, now, rerun = false }) {
  const previous = rerun ? {} : subjectsOf(ledger)
  const run = []
  const reused = []
  for (const entry of include) {
    const key = subjectKey(entry)
    const fingerprint = fingerprints[key]
    const from = previous[key]
    if (fingerprint && from?.fingerprint === fingerprint && recentEnough(from, now)) reused.push({ ...entry, key, fingerprint, from })
    else run.push(entry)
  }
  return { run, reused }
}

// A cell that could not decide is not a measurement worth keeping: an errored
// trial or a starved budget deserves another draw on the next push.
const decided = (result) =>
  (result?.verdicts ?? []).length > 0 && result.verdicts.every((verdict) => verdictState(verdict) !== 'inconclusive')

/**
 * The ledger this run leaves for the next push of the PR: each subject measured
 * now under this run, each reused subject under the run that measured it.
 *
 * @param {{ planned: Array<{ kind: string, name: string, fingerprint: string }>, reused: Array<{ key: string, from: object }>, fresh: Record<string, object>, run: { measuredSha: string, headSha: string, runId: string, runUrl: string, measuredAt: string } }} record
 */
export function recordLedger({ planned, reused, fresh, run }) {
  const subjects = {}
  for (const { key, from } of reused) subjects[key] = from
  for (const entry of planned) {
    const key = subjectKey(entry)
    if (!subjects[key] && decided(fresh[key])) subjects[key] = { fingerprint: entry.fingerprint, ...run }
  }
  return { schemaVersion: LEDGER_VERSION, subjects }
}

/** A reused cell, stamped with the run that measured it so it never reads as fresh. */
export function stampReused(result, { measuredSha, headSha, runId, runUrl, measuredAt }) {
  return { ...result, reuse: { measuredSha, headSha, runId, runUrl, measuredAt } }
}
