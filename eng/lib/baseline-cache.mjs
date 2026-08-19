// Per-stimulus reuse of the baseline arm, for the local iteration loop only.
//
// While iterating on a skill you re-run both arms every time, and the baseline
// arm is the half that cannot have changed: `eng/run-vally-evals.sh` invokes it
// with `--skill-dir $(mktemp -d)`, so the skill under test is not in it. Editing
// SKILL.md cannot move a baseline record. Editing the eval can.
//
// So the cache keys on the eval, at STIMULUS granularity: change one stimulus
// and only that stimulus's baseline is re-run; leave it alone and its records
// are served from disk. That is the whole feature.
//
// WHAT THIS IS NOT. A cached baseline is a frozen DRAW, not a fresh sample, and
// this repository has the receipts: two archived baseline arms of outside-in-tdd,
// same model, twelve minutes apart, byte-identical stimuli, differ by 0.14 in
// contrast score. Pairing a fresh skilled arm against a frozen baseline compares
// against that one draw rather than against the baseline distribution, which
// biases the sign test in whichever direction the draw happened to land. That is
// tolerable for a local loop answering "did my edit move anything"; it is not a
// publishable verdict. `baselineProvenance` is stamped on the result so nothing
// downstream can mistake one for the other.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { parseBlocks, stripQuotes } from './pilot-spec.mjs'

const SRC_LINE = /^[ \t]*-[ \t]+src:[ \t]*(.+?)[ \t]*$/

// Header keys that can move a baseline record. `defaults.runs` sets the trial
// count that `keyOf` pairs on — get it wrong and the arm has unmatched trials
// rather than a wrong answer; `defaults.timeout` can truncate a run; `scoring`
// and `type` change how a trial is executed and scored. Everything else up
// there — the spec's own `name` and `description` — is metadata the agent never
// sees, so editing it must not evict a single block.
const HEADER_KEYS = new Set(['defaults', 'scoring', 'type'])
const TOP_LEVEL_KEY = /^([A-Za-z_][\w-]*):/

/** The header lines that actually reach a run, in order. */
export function significantHeader(headerLines) {
  const kept = []
  let inside = false
  for (const line of headerLines ?? []) {
    const match = TOP_LEVEL_KEY.exec(line)
    if (match) inside = HEADER_KEYS.has(match[1])
    else if (!line.trim()) continue
    if (inside) kept.push(line)
  }
  return kept
}

const digest = (value) => createHash('sha256').update(value).digest('hex')

/** The fixture paths a stimulus stages, as written in its `environment.files`. */
export function stimulusFixtures(blockLines) {
  const paths = []
  for (const line of blockLines ?? []) {
    const match = SRC_LINE.exec(line)
    if (match) paths.push(stripQuotes(match[1]))
  }
  return paths
}

/**
 * A cache key per stimulus — one `- name:` block is one cache unit.
 *
 * Change a block and only that block is re-run; leave it alone and its records
 * are served. From the header only `defaults`, `scoring` and `type` contribute,
 * because only those reach a run: `defaults.runs` sets the trial count the
 * pairing keys on, so it must evict everything, while the spec's own `name` and
 * `description` are metadata the agent never sees and must evict nothing.
 *
 * Fixtures are hashed by the paths the stimulus actually names, never by walking
 * the fixture tree: those trees carry gitignored `bin/` and `obj/` build output,
 * so a local `dotnet build` would evict the whole cache.
 *
 * @param {string} content raw eval.yaml content
 * @param {{ specDir: string, model: string, judgeModel: string, runs?: string, vally: string }} env
 * @returns {Map<string, string>} stimulus name -> key
 */
export function stimulusKeys(content, env) {
  const { header, blocks } = parseBlocks(content)
  if (!blocks.length) throw new Error('spec declares no stimuli')

  const environment = [
    `model=${env.model}`,
    `judge=${env.judgeModel}`,
    `runs=${env.runs ?? 'spec'}`,
    `vally=${env.vally}`,
    `header=${digest(significantHeader(header).join('\n'))}`,
  ].join('\0')

  const keys = new Map()
  for (const block of blocks) {
    const fixtures = stimulusFixtures(block.lines).map((path) => {
      const full = resolve(env.specDir, path)
      // A missing fixture is hashed as absent rather than thrown on: the miss it
      // forces is the correct outcome, and the eval itself will report the real
      // error far better than a cache lookup can.
      return `${path}=${existsSync(full) ? digest(readFileSync(full)) : 'absent'}`
    })
    keys.set(block.name, digest([environment, block.lines.join('\n'), ...fixtures].join('\0')).slice(0, 32))
  }
  return keys
}

/**
 * Records that cannot be paired must never enter the cache.
 *
 * `eng/lib/paired-trials.mjs` keys on `stimulus + trialIndex` and falls back to
 * `itemId`, which embeds the absolute workspace path — machine-specific, so it
 * never matches a later run. Eleven of the fourteen baseline arms archived in
 * this repository have no `trialIndex` at all; replaying one of those produces
 * zero pairs and an unexplained `inconclusive` rather than an error. Refuse them
 * at the door, in both directions.
 */
export function isPairable(record) {
  return typeof record?.stimulus === 'string' && Number.isInteger(record?.trialIndex)
}

const readJsonl = (path) =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))

/**
 * Split the spec's stimuli into those the cache can serve and those it cannot.
 *
 * @param {Map<string, string>} keys from `stimulusKeys`
 * @param {string} cacheDir
 * @returns {{ hits: {name: string, key: string, records: object[]}[], misses: string[] }}
 */
export function partition(keys, cacheDir) {
  const hits = []
  const misses = []
  for (const [name, key] of keys) {
    const path = join(cacheDir, `${key}.jsonl`)
    if (!existsSync(path)) {
      misses.push(name)
      continue
    }
    let records
    try {
      records = readJsonl(path)
    } catch {
      misses.push(name)
      continue
    }
    // A stimulus is served whole or not at all: a partially pairable set would
    // silently shrink the trial count for that stimulus only, which reads
    // downstream as an unmatched trial rather than as a cache defect.
    if (!records.length || !records.every(isPairable) || !records.every((r) => r.stimulus === name)) {
      misses.push(name)
      continue
    }
    hits.push({ name, key, records })
  }
  return { hits, misses }
}

/** Write each stimulus's records under its key, skipping anything unpairable. */
export function store(records, keys, cacheDir) {
  mkdirSync(cacheDir, { recursive: true })
  const byStimulus = new Map()
  for (const record of records) {
    if (!isPairable(record)) continue
    const bucket = byStimulus.get(record.stimulus) ?? []
    bucket.push(record)
    byStimulus.set(record.stimulus, bucket)
  }

  const stored = []
  for (const [name, bucket] of byStimulus) {
    const key = keys.get(name)
    if (!key) continue
    writeFileSync(join(cacheDir, `${key}.jsonl`), `${bucket.map((r) => JSON.stringify(r)).join('\n')}\n`)
    stored.push(name)
  }
  return stored
}

/**
 * One baseline arm from cached and freshly run records.
 *
 * Ordering is by stimulus then trial index so the merged file reads like a run
 * that happened in one go; `pairTrials` does not care about order, a human
 * diffing two arms does.
 */
export function mergeArm(cachedRecords, freshRecords) {
  const all = [...cachedRecords, ...freshRecords].filter(isPairable)
  all.sort((a, b) => (a.stimulus === b.stimulus ? a.trialIndex - b.trialIndex : a.stimulus.localeCompare(b.stimulus)))
  return all
}

/**
 * The ambient skills a run observed, which `--skill-dir` does not control.
 *
 * Baseline trials in this repository record `skillsLoaded: ["customize-cloud-agent",
 * "github-pr-media"]` — skills injected by the host Copilot runtime that exist
 * nowhere in the repo. They are a real input to the baseline and they differ
 * between machines, so a cache entry filled on one host and served on another is
 * not comparing like with like. Not fatal for a local loop; worth saying out loud.
 */
export function ambientSkills(records) {
  const seen = new Set()
  for (const record of records ?? []) {
    for (const name of record?.trajectory?.metadata?.skillsLoaded ?? []) seen.add(name)
  }
  return [...seen].sort()
}

/** Human-readable line for the runner, and the provenance stamp for the result. */
export function provenance({ hits, misses, ambient }) {
  return {
    cachedStimuli: hits.map((hit) => hit.name).sort(),
    freshStimuli: [...misses].sort(),
    ambientSkills: ambient ?? [],
    publishable: hits.length === 0,
  }
}

/** Cache location for one eval, under a root that must stay out of git. */
export function cacheDirFor(root, evalName) {
  return join(root, evalName)
}

export { dirname, readJsonl }
