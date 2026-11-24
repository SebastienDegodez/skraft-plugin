#!/usr/bin/env node
// What comparison.md does not say about a RESEARCH or DESIGN A/B run: where the tool time went,
// by kind of call and by tool, and how many decisions of record each trial wrote.
//
//   node eng/research-design-report.mjs bench-results/<suite>/<stamp> [--out report.md]
//
// Reads <run>/{control,candidate}/results/**/results.jsonl, the files eng/bench-agent-ab.sh leaves.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { toolSpans } from './lib/agent-ab.mjs'
import { turnSummary, turnsOf } from './lib/agent-turns.mjs'

const { values, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string' } } })
if (positionals.length !== 1) {
  console.error('Usage: research-design-report.mjs bench-results/<suite>/<stamp> [--out report.md]')
  process.exit(2)
}
const run = positionals[0]

const find = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? find(join(dir, entry.name)) : entry.name === 'results.jsonl' ? [join(dir, entry.name)] : [],
      )
    : []

const trialsOf = (arm) =>
  find(join(run, arm, 'results'))
    .slice(0, 1)
    .flatMap((path) => readFileSync(path, 'utf8').split('\n'))
    .filter((line) => line.trim())
    .flatMap((line) => {
      try {
        return [JSON.parse(line)]
      } catch {
        return []
      }
    })
    .filter((record) => record?.type === 'trial-result')

const median = (numbers) => {
  const ordered = numbers.filter(Number.isFinite).sort((left, right) => left - right)
  if (!ordered.length) return null
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2
}
const seconds = (ms) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)} s`)
const count = (value) => (value == null ? '—' : String(Math.round(value * 10) / 10))

const ADR = /docs\/adr\/adr-\d+[A-Za-z0-9._-]*\.md/g
const WRITES = new Set(['edit', 'create', 'write', 'str_replace', 'str_replace_editor', 'apply_patch', 'insert'])

/** The decisions of record a trial wrote, read from its file writes, its shell redirections and `artifact adr --out`. */
const adrsWritten = (events = []) => {
  const files = new Set()
  for (const event of events) {
    if (event?.type !== 'tool_call') continue
    const tool = event.data?.toolName ?? ''
    const text = JSON.stringify(event.data?.arguments ?? '')
    const shellWrite = (tool === 'bash' || tool === 'shell' || tool === 'powershell') && /(?:>|\btee\b|Set-Content|Out-File|\badr\s+--out\b)/.test(text)
    if (!WRITES.has(tool) && !shellWrite) continue
    for (const match of text.match(ADR) ?? []) files.add(match)
  }
  return [...files].sort()
}

const profile = (record) => {
  const events = record?.trajectory?.events ?? []
  const summary = turnSummary(turnsOf(events))
  const byTool = {}
  for (const span of toolSpans(events)) {
    const entry = (byTool[span.toolName] ??= { calls: 0, durationMs: 0, outputChars: 0 })
    entry.calls += 1
    entry.durationMs += span.durationMs
    entry.outputChars += span.outputChars
  }
  return {
    stimulus: record?.stimulus ?? record?.trajectory?.stimulus?.name ?? 'unknown',
    summary,
    byTool,
    adrs: adrsWritten(events),
    slowest: toolSpans(events).sort((left, right) => right.durationMs - left.durationMs).slice(0, 5),
  }
}

const table = (title, key, arms) => {
  const names = [...new Set(Object.values(arms).flatMap((profiles) => profiles.flatMap((one) => Object.keys(one[key]))))].sort()
  const cell = (profiles, name, field) => median(profiles.map((one) => one[key][name]?.[field] ?? 0))
  return [
    `#### ${title} (median per trial)`,
    '',
    '| | control: calls | control: time | candidate: calls | candidate: time |',
    '|---|---|---|---|---|',
    ...names.map(
      (name) =>
        `| ${name} | ${count(cell(arms.control, name, 'calls'))} | ${seconds(cell(arms.control, name, 'durationMs'))} | ${count(cell(arms.candidate, name, 'calls'))} | ${seconds(cell(arms.candidate, name, 'durationMs'))} |`,
    ),
    '',
  ]
}

const arms = { control: trialsOf('control').map(profile), candidate: trialsOf('candidate').map(profile) }
if (!arms.control.length && !arms.candidate.length) {
  console.error(`No trial under ${run}/{control,candidate}/results`)
  process.exit(1)
}

const lines = [`# Where the time went — ${run}`, '']
const stimuli = [...new Set(Object.values(arms).flatMap((profiles) => profiles.map((one) => one.stimulus)))]
for (const stimulus of stimuli) {
  const of = Object.fromEntries(Object.entries(arms).map(([arm, profiles]) => [arm, profiles.filter((one) => one.stimulus === stimulus)]))
  const turns = (arm, field) => count(median(of[arm].map((one) => one.summary[field])))
  lines.push(
    `## ${stimulus}`,
    '',
    `Trials: control ${of.control.length}, candidate ${of.candidate.length}.`,
    '',
    '| Median per trial | control | candidate |',
    '|---|---|---|',
    `| Turns | ${turns('control', 'turns')} | ${turns('candidate', 'turns')} |`,
    `| Turns with a single read | ${turns('control', 'singleRead')} | ${turns('candidate', 'singleRead')} |`,
    `| Turns with several calls | ${turns('control', 'parallel')} | ${turns('candidate', 'parallel')} |`,
    `| Decisions of record written | ${count(median(of.control.map((one) => one.adrs.length)))} | ${count(median(of.candidate.map((one) => one.adrs.length)))} |`,
    '',
    ...table('By kind of call', 'summaryCategories', Object.fromEntries(Object.entries(of).map(([arm, profiles]) => [arm, profiles.map((one) => ({ summaryCategories: one.summary.categories }))]))),
    ...table('By tool', 'byTool', of),
    '#### Per trial',
    '',
    '| Arm | Trial | Decisions of record written | Five slowest calls |',
    '|---|---|---|---|',
    ...Object.entries(of).flatMap(([arm, profiles]) =>
      profiles.map(
        (one, index) =>
          `| ${arm} | ${index + 1} | ${one.adrs.length}${one.adrs.length ? ` (${one.adrs.map((path) => path.replace('docs/adr/', '')).join(', ')})` : ''} | ${
            one.slowest.map((span) => `${span.toolName} ${seconds(span.durationMs)}${span.command ? ` \`${span.command.replace(/\s+/g, ' ').replace(/\|/g, '\\|').slice(0, 40)}\`` : ''}`).join(' · ') || '—'
          } |`,
      ),
    ),
    '',
  )
}

const markdown = `${lines.join('\n')}\n`
if (values.out) writeFileSync(values.out, markdown)
process.stdout.write(markdown)
