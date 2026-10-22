#!/usr/bin/env node
// Skip the pre-merge evaluation of a subject whose inputs did not move since the
// PR's latest evaluation, and leave the ledger the next push reads.
//
//   node eng/eval-reuse.mjs plan --matrix matrix.json [--previous <ledger-dir>] --out-dir eval-plan [--rev HEAD]
//     prints the matrix still to run; writes <out>/plan.json and the reused cells
//     under <out>/reused/<kind>-<name>/results.json, each stamped with its run.
//   node eng/eval-reuse.mjs record --plan eval-plan --results-dir eval-results --out-dir eval-ledger
//                                  --measured-sha <sha> --head-sha <sha> --run-id <id> --run-url <url>
//     writes <out>/ledger.json and <out>/cells/<kind>-<name>/results.json.
//
// Run from the repository root. Fingerprints are read from `git ls-tree -r <rev>`,
// so they describe a commit, never the working tree. A previous ledger or cell
// that cannot be read makes its subject run.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import {
  PINNED_ENV,
  parseCompanions,
  parseTree,
  planReuse,
  recordLedger,
  stampReused,
  subjectFingerprint,
  subjectKey,
} from './lib/eval-reuse.mjs'

const USAGE = [
  'Usage: node eng/eval-reuse.mjs plan --matrix <file> [--previous <dir>] --out-dir <dir> [--rev <rev>]',
  '       node eng/eval-reuse.mjs record --plan <dir> --results-dir <dir> --out-dir <dir>',
  '            --measured-sha <sha> --head-sha <sha> --run-id <id> --run-url <url>',
].join('\n')

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    matrix: { type: 'string' },
    previous: { type: 'string' },
    'out-dir': { type: 'string' },
    rev: { type: 'string', default: 'HEAD' },
    plan: { type: 'string' },
    'results-dir': { type: 'string' },
    'measured-sha': { type: 'string' },
    'head-sha': { type: 'string' },
    'run-id': { type: 'string' },
    'run-url': { type: 'string' },
    help: { type: 'boolean', default: false },
  },
  strict: true,
})

const fail = (message) => {
  console.error(message)
  process.exit(2)
}

const git = (args) => spawnSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

const writeJson = (file, value) => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

const cellDir = ({ kind, name }) => `${kind}-${name}`

function companionsAt(rev, entry) {
  if (entry.kind !== 'skill') return []
  const sidecar = git(['show', `${rev}:tests/skills/${entry.name}/eval.skill-dir.yaml`])
  return sidecar.status === 0 ? parseCompanions(sidecar.stdout) : []
}

// A previous entry counts only when its cell can be carried: a ledger line whose
// results file is missing or unreadable is dropped, so that subject runs.
function readPrevious(dir) {
  if (!dir) return { ledger: null, cells: {} }
  const ledger = readJson(join(dir, 'ledger.json'))
  const subjects = {}
  const cells = {}
  for (const [key, entry] of Object.entries(ledger?.subjects ?? {})) {
    const [kind, ...rest] = key.split(':')
    const result = readJson(join(dir, 'cells', cellDir({ kind, name: rest.join(':') }), 'results.json'))
    if (!Array.isArray(result?.verdicts)) continue
    subjects[key] = entry
    cells[key] = result
  }
  return { ledger: ledger ? { ...ledger, subjects } : null, cells }
}

function plan() {
  if (!values.matrix || !values['out-dir']) fail(USAGE)
  const { include } = JSON.parse(readFileSync(values.matrix, 'utf8'))
  const listing = git(['ls-tree', '-r', values.rev])
  if (listing.status !== 0) fail(`git ls-tree -r ${values.rev} failed: ${listing.stderr.trim()}`)
  const tree = parseTree(listing.stdout)
  const env = Object.fromEntries(PINNED_ENV.map((key) => [key, process.env[key]]))
  const planned = include.map((entry) => ({
    ...entry,
    key: subjectKey(entry),
    fingerprint: subjectFingerprint(entry, { tree, companions: companionsAt(values.rev, entry), env }),
  }))
  const fingerprints = Object.fromEntries(planned.map(({ key, fingerprint }) => [key, fingerprint]))
  const previous = readPrevious(values.previous)
  const { run, reused } = planReuse({ include, fingerprints, ledger: previous.ledger })

  const out = resolve(values['out-dir'])
  for (const entry of reused) {
    writeJson(join(out, 'reused', cellDir(entry), 'results.json'), stampReused(previous.cells[entry.key], entry.from))
    console.error(`Reusing ${entry.key}: inputs unchanged since ${entry.from.headSha ?? entry.from.measuredSha} (run ${entry.from.runId}).`)
  }
  writeJson(join(out, 'plan.json'), {
    planned,
    reused: reused.map(({ kind, name, key, from }) => ({ kind, name, key, from })),
  })
  console.log(JSON.stringify({ include: run }))
}

function record() {
  for (const option of ['plan', 'results-dir', 'out-dir', 'measured-sha', 'head-sha', 'run-id', 'run-url']) {
    if (!values[option]) fail(USAGE)
  }
  const planned = readJson(join(values.plan, 'plan.json'))
  if (!Array.isArray(planned?.planned)) fail(`No readable plan under ${values.plan}; no ledger written.`)
  const reusedKeys = new Set(planned.reused.map(({ key }) => key))
  const cells = {}
  for (const entry of planned.planned) {
    cells[entry.key] = reusedKeys.has(entry.key)
      ? readJson(join(values.plan, 'reused', cellDir(entry), 'results.json'))
      : readJson(join(values['results-dir'], entry.name, 'results.json'))
  }
  const fresh = Object.fromEntries(Object.entries(cells).filter(([key]) => !reusedKeys.has(key)))
  const ledger = recordLedger({
    planned: planned.planned,
    reused: planned.reused.filter(({ key }) => cells[key]),
    fresh,
    measuredAt: {
      measuredSha: values['measured-sha'],
      headSha: values['head-sha'],
      runId: values['run-id'],
      runUrl: values['run-url'],
    },
  })
  const out = resolve(values['out-dir'])
  for (const entry of planned.planned) {
    if (ledger.subjects[entry.key]) writeJson(join(out, 'cells', cellDir(entry), 'results.json'), cells[entry.key])
  }
  writeJson(join(out, 'ledger.json'), ledger)
  console.error(`Recorded ${Object.keys(ledger.subjects).length} reusable cell(s) of ${planned.planned.length} planned.`)
}

if (values.help) {
  console.log(USAGE)
  process.exit(0)
}
const command = { plan, record }[positionals[0]]
if (!command || positionals.length !== 1) fail(USAGE)
command()
