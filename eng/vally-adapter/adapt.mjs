#!/usr/bin/env node
// Turn a Vally experiment run into one publishable verdict per evaluated skill.
//
// `vally experiment run` produces one JSONL stream per variant (baseline =
// no skill, skilled = only the skill under test). This adapter regroups those
// records per eval spec, asks `vally compare` to judge each pair, and writes:
//
//   <output-root>/<skill>/results.json
//
//   node eng/vally-adapter/adapt.mjs --experiment-dir eval-results/_experiment/<run>
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { comparisonVerdict } from '../lib/verdict.mjs'

const { values: options } = parseArgs({
  options: {
    'experiment-dir': { type: 'string' },
    'output-root': { type: 'string', default: 'eval-results' },
    'baseline-variant': { type: 'string', default: 'baseline' },
    'skilled-variant': { type: 'string', default: 'skilled' },
    vally: { type: 'string', default: 'npx --yes @microsoft/vally-cli@0.12.0' },
    model: { type: 'string', default: 'unknown' },
    'judge-model': { type: 'string', default: 'unknown' },
    help: { type: 'boolean', default: false },
  },
  strict: true,
})

if (options.help || !options['experiment-dir']) {
  console.log(`Usage: node eng/vally-adapter/adapt.mjs --experiment-dir <run-dir> [options]

Compare the baseline and skilled records of a Vally experiment, one verdict per
evaluated skill, and write <output-root>/<skill>/results.json.`)
  process.exit(options.help ? 0 : 1)
}

const parseJsonl = (file) => {
  const text = readFileSync(file, 'utf8').trim()
  return text ? text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)) : []
}

const evalFileOf = (record) => record.experiment?.evalFile ?? record.evalFilePath ?? ''

const groupByEval = (records) => {
  const grouped = new Map()
  for (const record of records.filter((record) => record.type === 'trial-result')) {
    const evalFile = evalFileOf(record)
    if (!evalFile) continue
    grouped.set(evalFile, [...(grouped.get(evalFile) ?? []), record])
  }
  return grouped
}

// tests/skills/<skill>/eval.yaml → the skill it exercises.
const identity = (evalFile) => {
  const skill = basename(dirname(evalFile.split('\\').join('/')))
  return { kind: 'skill', name: skill, path: `plugins/skills/${skill}` }
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

const runDirectory = resolve(options['experiment-dir'])
const outputRoot = resolve(options['output-root'])
const baseline = groupByEval(parseJsonl(join(runDirectory, options['baseline-variant'], 'results.jsonl')))
const skilled = groupByEval(parseJsonl(join(runDirectory, options['skilled-variant'], 'results.jsonl')))
const evaluations = [...new Set([...baseline.keys(), ...skilled.keys()])].sort()
const temporary = mkdtempSync(join(tmpdir(), 'skraft-vally-adapter-'))

let written = 0
let incomplete = 0

try {
  for (const evalFile of evaluations) {
    const baselineRecords = baseline.get(evalFile) ?? []
    const skilledRecords = skilled.get(evalFile) ?? []
    const evaluation = identity(evalFile)

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

    const verdict = comparisonVerdict(report, evaluation)
    const result = {
      runner: 'vally',
      model: options.model,
      judgeModel: options['judge-model'],
      timestamp: new Date().toISOString(),
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
