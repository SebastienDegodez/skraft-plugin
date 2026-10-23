// Pure rules behind skipping a pre-merge evaluation whose inputs did not move.
//
// A PR evaluates every subject its diff touches against the base, so each new
// push re-runs real-model evaluations for subjects the push never touched. A
// subject's verdict can only change when something it reads changes: its skill
// or agent descriptors, its eval spec and fixtures, the companion skills mounted
// beside it, the evaluation tooling, or the pinned toolchain and models. The
// fingerprint below hashes exactly those, from git blobs, so two commits with the
// same fingerprint would put the same inputs in front of the same model.
//
// The list errs toward running: a file is an input when the runner or the
// executor can read it, not only when it obviously matters.
import { createHash } from 'node:crypto'
import { posix } from 'node:path'

import { verdictState } from './verdict.mjs'

const FINGERPRINT_VERSION = 'skraft-eval-fingerprint/1'

/**
 * The environment a run reads that can change its result. Concurrency dials are
 * left out: they change the wall clock, not what is measured.
 */
export const PINNED_ENV = Object.freeze([
  'VALLY_PACKAGE',
  'COPILOT_SDK_PACKAGE',
  'COPILOT_CLI_PACKAGE',
  'JUDGE_MODEL',
  'MODEL',
  'DEFAULT_MODEL',
  'RUNS',
  'SKILL_MAX_RETRIES',
  'AGENT_MAX_RETRIES',
])

// Everything a skill comparison or an agent suite executes besides its subject:
// the runner, both adapters and the executor, every library they import, the
// helpers the runner calls, the planners that decide what a cell runs, the
// project dependencies installed beside the toolchain, and the workflow that
// pins the toolchain and sets up the runner.
const TOOLING = [
  /^eng\/run-vally-evals\.sh$/,
  /^eng\/vally-adapter\//,
  /^eng\/vally-agent-executor\//,
  /^eng\/lib\//,
  /^eng\/(?:resolve-eval-model|make-pilot-spec|baseline-cache-bin|plan-eval-matrix|eval-reuse)\.mjs$/,
  /^package(?:-lock)?\.json$/,
  /^\.github\/workflows\/skill-evaluation\.yml$/,
]

// An agent suite mounts every plugin's skills, copies the plugin assets into
// each session, and registers descriptors from both Copilot agent trees and the
// repository's own agents.
const AGENT_SOURCES = [
  /^plugins\/[^/]+\/skills\//,
  /^plugins\/[^/]+\/assets\//,
  /^plugins\/[^/]+\/com\.github\.copilot\/agents\//,
  /^\.github\/agents\//,
]

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const skillTree = (name) => new RegExp(`^plugins/[^/]+/skills/${escape(name)}/`)

const subjectSources = ({ kind, name }, companions) =>
  kind === 'agent'
    ? [new RegExp(`^tests/agents/${escape(name)}/`), ...AGENT_SOURCES]
    : [new RegExp(`^tests/skills/${escape(name)}/`), skillTree(name), ...companions.map(skillTree)]

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

const stagedTree = (paths) => paths.map((path) => new RegExp(`^${escape(path)}(?:/|$)`))

/** The key a subject is recorded under: a skill and a suite may share a name. */
export const subjectKey = ({ kind, name }) => `${kind}:${name}`

/**
 * The content hash of everything that can change a subject's verdict.
 *
 * @param {{ kind: 'skill' | 'agent', name: string }} subject
 * @param {{ tree: Array<{ mode: string, blob: string, path: string }>, companions?: string[], staged?: string[], env?: Record<string, string | undefined> }} inputs
 * @returns {string} `sha256:<hex>`
 */
export function subjectFingerprint(subject, { tree, companions = [], staged = [], env = {} }) {
  const sources = [...subjectSources(subject, companions), ...stagedTree(staged), ...TOOLING]
  const files = tree
    .filter(({ path }) => sources.some((pattern) => pattern.test(path)))
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
    .map(({ mode, blob, path }) => `${mode} ${blob}\t${path}`)
  const lines = [
    FINGERPRINT_VERSION,
    subjectKey(subject),
    `args=${subject.args ?? ''}`,
    `companions=${[...companions].sort().join(',')}`,
    ...PINNED_ENV.map((key) => `${key}=${env[key] ?? ''}`),
    ...files,
  ]
  return `sha256:${createHash('sha256').update(lines.join('\n')).digest('hex')}`
}

const LEDGER_VERSION = 1

const subjectsOf = (ledger) =>
  ledger?.schemaVersion === LEDGER_VERSION && ledger.subjects && typeof ledger.subjects === 'object' ? ledger.subjects : {}

/**
 * Which planned subjects still have to run, and which can carry the cell of the
 * PR's latest evaluation because their fingerprint did not move since. Anything
 * unreadable — no ledger, another schema, no fingerprint — runs.
 *
 * @param {{ include: Array<{ kind: 'skill' | 'agent', name: string }>, fingerprints: Record<string, string>, ledger?: unknown }} plan
 * @returns {{ run: object[], reused: object[] }}
 */
export function planReuse({ include, fingerprints, ledger }) {
  const previous = subjectsOf(ledger)
  const run = []
  const reused = []
  for (const entry of include) {
    const key = subjectKey(entry)
    const fingerprint = fingerprints[key]
    const from = previous[key]
    if (fingerprint && from?.fingerprint === fingerprint) reused.push({ ...entry, key, fingerprint, from })
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
 * @param {{ planned: Array<{ kind: string, name: string, fingerprint: string }>, reused: Array<{ key: string, from: object }>, fresh: Record<string, object>, measuredAt: { measuredSha: string, headSha: string, runId: string, runUrl: string } }} run
 */
export function recordLedger({ planned, reused, fresh, measuredAt }) {
  const subjects = {}
  for (const { key, from } of reused) subjects[key] = from
  for (const entry of planned) {
    const key = subjectKey(entry)
    if (!subjects[key] && decided(fresh[key])) subjects[key] = { fingerprint: entry.fingerprint, ...measuredAt }
  }
  return { schemaVersion: LEDGER_VERSION, subjects }
}

/** A reused cell, stamped with the run that measured it so it never reads as fresh. */
export function stampReused(result, { measuredSha, headSha, runId, runUrl }) {
  return { ...result, reuse: { measuredSha, headSha, runId, runUrl } }
}
