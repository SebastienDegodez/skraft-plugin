#!/usr/bin/env node
// Per-stimulus baseline reuse for the local loop. Driven by eng/run-vally-evals.sh
// when BASELINE_CACHE=1; nothing else should call it.
//
//   plan   --spec <eval.yaml> --cache-dir <dir> --work <dir> [--model --judge-model --runs --vally]
//          Decides what still has to run. Prints one TAB-separated line:
//            <mode>\t<spec-to-run>\t<cached-count>\t<fresh-count>
//          mode is `hit` (nothing to run), `partial` (spec-to-run is a filtered
//          copy) or `full`.
//
//   commit --spec <eval.yaml> --cache-dir <dir> --work <dir> [--fresh <results.jsonl>]
//          Stores the freshly produced records under their stimulus keys, merges
//          them with whatever was served from cache, and prints the path of the
//          merged arm for `adapt.mjs --baseline`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { ambientSkills, isPairable, mergeArm, partition, provenance, stimulusKeys, store } from './lib/baseline-cache.mjs'
import { pilotSpec } from './lib/pilot-spec.mjs'

const [command] = process.argv.slice(2)
const { values } = parseArgs({
  args: process.argv.slice(3),
  options: {
    spec: { type: 'string' },
    'cache-dir': { type: 'string' },
    work: { type: 'string' },
    fresh: { type: 'string' },
    model: { type: 'string', default: 'unknown' },
    'judge-model': { type: 'string', default: 'unknown' },
    runs: { type: 'string', default: '' },
    vally: { type: 'string', default: 'unknown' },
  },
  strict: true,
})

const fail = (message) => {
  console.error(`baseline-cache: ${message}`)
  process.exit(1)
}

if (!['plan', 'commit'].includes(command)) fail('usage: baseline-cache-bin.mjs <plan|commit> --spec <f> --cache-dir <d> --work <d>')
if (!values.spec || !values['cache-dir'] || !values.work) fail('--spec, --cache-dir and --work are required')

// The cache trades a fresh baseline draw for a stored one. That is a local
// convenience, never a published verdict, and CI must not be able to opt in by
// accident.
if (process.env.CI || process.env.GITHUB_ACTIONS) fail('refusing to run under CI — the baseline cache is a local-loop tool only')

const specPath = resolve(values.spec)
const specContent = readFileSync(specPath, 'utf8')
const keys = stimulusKeys(specContent, {
  specDir: dirname(specPath),
  model: values.model,
  judgeModel: values['judge-model'],
  runs: values.runs || undefined,
  vally: values.vally,
})

const cacheDir = resolve(values['cache-dir'])
const work = resolve(values.work)
const CACHED_ARM = join(work, '.cached-baseline.jsonl')
const PLAN_FILE = join(work, '.cache-plan.json')
const FILTERED_SPEC = join(dirname(specPath), '.baseline-cache.eval.yaml')

const writeJsonl = (path, records) => writeFileSync(path, records.length ? `${records.map((r) => JSON.stringify(r)).join('\n')}\n` : '')

if (command === 'plan') {
  const { hits, misses } = partition(keys, cacheDir)
  mkdirSync(work, { recursive: true })
  writeJsonl(CACHED_ARM, hits.flatMap((hit) => hit.records))
  writeFileSync(PLAN_FILE, JSON.stringify({ cached: hits.map((h) => h.name), fresh: misses }, null, 2))

  if (!misses.length) {
    console.log(['hit', '', String(hits.length), '0'].join('\t'))
  } else if (!hits.length) {
    console.log(['full', specPath, '0', String(misses.length)].join('\t'))
  } else {
    // Reuse the pilot filter: one parser over this file shape, not two. Exact
    // names are passed as selectors, and `pilotSpec` matches by substring — a
    // stimulus whose name contains another's would drag its sibling in, which is
    // safe here (it only costs a re-run) but is why the fresh list is recomputed
    // from what actually ran rather than trusted from the plan.
    writeFileSync(FILTERED_SPEC, pilotSpec(specContent, misses).spec)
    console.log(['partial', FILTERED_SPEC, String(hits.length), String(misses.length)].join('\t'))
  }
  process.exit(0)
}

// commit
const cached = existsSync(CACHED_ARM)
  ? readFileSync(CACHED_ARM, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
  : []
const fresh = values.fresh && existsSync(values.fresh)
  ? readFileSync(values.fresh, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
  : []

const unpairable = fresh.filter((r) => !isPairable(r)).length
if (unpairable) {
  // Not fatal — the run still has a fresh arm — but the records cannot be keyed,
  // so nothing is stored and the next run pays again. Say why.
  console.error(`baseline-cache: ${unpairable} fresh record(s) carry no trialIndex and were not cached`)
}

const stored = store(fresh, keys, cacheDir)
const merged = mergeArm(cached, fresh)
const mergedPath = join(work, 'merged-baseline.jsonl')
writeJsonl(mergedPath, merged)

const cachedNames = [...new Set(cached.map((r) => r.stimulus))]
const stamp = provenance({
  hits: cachedNames.map((name) => ({ name })),
  misses: [...new Set(fresh.map((r) => r.stimulus))],
  ambient: ambientSkills(merged),
})
writeFileSync(PLAN_FILE, JSON.stringify({ ...stamp, storedThisRun: stored }, null, 2))

console.error(
  `baseline-cache: ${cachedNames.length} stimulus/stimuli served from cache, ${stored.length} stored — ` +
    `${stamp.publishable ? 'arm is fully fresh' : 'NOT a publishable verdict'}`
)
console.log(mergedPath)
