#!/usr/bin/env node
// Turn a pair of Vally runs into one publishable verdict for the skill they
// isolate.
//
// eng/run-vally-evals.sh runs the same eval spec twice — once with no skill
// (baseline), once with only the skill under test (skilled) — and hands both
// JSONL streams here. The eval's deterministic graders decide the pairwise
// tally; `vally compare` judges the trajectories as a published second opinion.
// The verdict lands at <output-root>/<skill>/results.json.
//
//   node eng/vally-adapter/adapt.mjs --baseline <jsonl> --skilled <jsonl> --skill <name>
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { comparisonVerdict } from '../lib/verdict.mjs'
import { buildEvaluationMetrics } from '../lib/vally-metrics.mjs'

let baselineProvenance = null

const { values: options } = parseArgs({
  options: {
    baseline: { type: 'string' },
    skilled: { type: 'string' },
    skill: { type: 'string' },
    'skill-path': { type: 'string' },
    'output-root': { type: 'string', default: 'eval-results' },
    vally: { type: 'string', default: 'npx --yes @microsoft/vally-cli@0.12.0' },
    model: { type: 'string', default: 'unknown' },
    'judge-model': { type: 'string', default: 'unknown' },
    // Written by eng/baseline-cache-bin.mjs when the local loop served part of
    // the baseline arm from disk. Absent means the arm was run fresh.
    'baseline-provenance': { type: 'string' },
    help: { type: 'boolean', default: false },
  },
  strict: true,
})

if (options['baseline-provenance']) {
  try {
    baselineProvenance = JSON.parse(readFileSync(options['baseline-provenance'], 'utf8'))
  } catch (error) {
    console.error(`baseline provenance unreadable (${error.message}) — treating the arm as fresh`)
  }
}

if (options.help || !options.baseline || !options.skilled || !options.skill) {
  console.log(`Usage: node eng/vally-adapter/adapt.mjs --baseline <jsonl> --skilled <jsonl> --skill <name> [options]

Compare the baseline and skilled records of one eval spec and write
<output-root>/<skill>/results.json.`)
  process.exit(options.help ? 0 : 1)
}

const parseJsonl = (file) => {
  const text = readFileSync(file, 'utf8').trim()
  return text ? text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)) : []
}

const splitCommand = (command) =>
  (command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []).map((token) => token.replace(/^["']|["']$/g, ''))

const compare = (baseline, skilled, output) => {
  const [binary, ...prefix] = splitCommand(options.vally)
  if (!binary) throw new Error('Vally command is empty')
  execFileSync(
    binary,
    [...prefix, 'compare', '--baseline', baseline, '--treatment', skilled, '--judge-model', options['judge-model'], '--output', output],
    { stdio: 'inherit' },
  )
  return parseJsonl(output)[0] ?? null
}

const outputRoot = resolve(options['output-root'])
const trialsOf = (file) => parseJsonl(resolve(file)).filter((record) => record.type === 'trial-result')

const pairs = [
  {
    evaluation: { kind: 'skill', name: options.skill, path: options['skill-path'] ?? `plugins/skraft-framework/skills/${options.skill}` },
    baselineRecords: trialsOf(options.baseline),
    skilledRecords: trialsOf(options.skilled),
  },
]

const temporary = mkdtempSync(join(tmpdir(), 'skraft-vally-adapter-'))

let written = 0
let incomplete = 0

try {
  for (const { evaluation, baselineRecords, skilledRecords } of pairs) {
    if (!baselineRecords.length || !skilledRecords.length) {
      console.warn(`⚠ ${evaluation.name}: missing baseline or skilled records`)
      incomplete += 1
      continue
    }

    const prefix = evaluation.name
    const baselineFile = join(temporary, `${prefix}__baseline.jsonl`)
    const skilledFile = join(temporary, `${prefix}__skilled.jsonl`)
    const compareFile = join(temporary, `${prefix}__compare.jsonl`)
    writeFileSync(baselineFile, `${baselineRecords.map((record) => JSON.stringify(record)).join('\n')}\n`)
    writeFileSync(skilledFile, `${skilledRecords.map((record) => JSON.stringify(record)).join('\n')}\n`)

    let report
    try {
      report = compare(baselineFile, skilledFile, compareFile)
    } catch (error) {
      console.warn(`⚠ ${evaluation.name}: Vally compare failed: ${error.message}`)
      incomplete += 1
      continue
    }
    if (!report) {
      console.warn(`⚠ ${evaluation.name}: Vally compare wrote no report`)
      incomplete += 1
      continue
    }

    // The raw records go in beside the judge's report: the eval's own graders
    // scored every trial, and that score — not the judge's read of the
    // trajectory — is what decides the tally. See eng/lib/verdict.mjs.
    const verdict = {
      ...comparisonVerdict(report, evaluation, { baselineRecords, skilledRecords }),
      metrics: buildEvaluationMetrics(baselineRecords, skilledRecords, evaluation.name),
    }
    const result = {
      runner: 'vally',
      model: options.model,
      judgeModel: options['judge-model'],
      timestamp: new Date().toISOString(),
      // A baseline served from cache is a frozen draw, not a fresh sample, so
      // the comparison is against one historical arm rather than against the
      // baseline distribution. Usable for a local "did my edit move anything";
      // never publishable, and stamped so nothing downstream has to guess.
      ...(baselineProvenance ? { baselineProvenance } : {}),
      verdicts: [verdict],
    }
    const directory = join(outputRoot, evaluation.name)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'results.json'), `${JSON.stringify(result, null, 2)}\n`)
    written += 1

    const icon = verdict.passed ? '✅' : verdict.underpowered || !verdict.conclusive ? '⚠️' : '❌'
    console.log(`${icon} ${evaluation.name}: ${verdict.reason}`)
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}

console.log(`Wrote ${written} results.json file(s) under ${outputRoot}${incomplete ? ` (${incomplete} incomplete)` : ''}`)
