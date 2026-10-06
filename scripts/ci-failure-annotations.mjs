#!/usr/bin/env node
// Turns a failed CI step's log into GitHub error annotations, so the reason a job failed
// can be read from the check run (UI and REST API: check-runs/{id}/annotations) without
// downloading the raw log.
//
//   node scripts/ci-failure-annotations.mjs node-test <log>   each failing test, with its error
//   node scripts/ci-failure-annotations.mjs tail <log> [n]    the last n meaningful lines (default 60)
//
// GitHub keeps at most 10 error annotations per step: the failures are packed into at
// most 10, each cut to a readable size.
import { readFileSync } from 'node:fs'

const MAX_ANNOTATIONS = 10
const MAX_CHARS = 3500

const escape = (text) => text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
const escapeProperty = (text) => escape(text).replace(/:/g, '%3A').replace(/,/g, '%2C')
const annotate = (title, message) => {
  const body = message.length > MAX_CHARS ? `${message.slice(0, MAX_CHARS)}\n…` : message
  console.log(`::error title=${escapeProperty(title)}::${escape(body)}`)
}

// Carriage-return progress lines keep only what was drawn last; colour codes go.
const clean = (text) => text
  .split('\n')
  .map((line) => line.split('\r').at(-1).replace(/\x1b\[[0-9;]*m/g, '').trimEnd())

// A TAP failure: the "not ok" line, then its indented YAML block (error, expected, actual…).
export const failingTests = (lines) => {
  const failures = []
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^(\s*)not ok \d+ - (.+)$/.exec(lines[i])
    if (!match) continue
    const indent = match[1].length
    const block = [lines[i].trim()]
    for (let j = i + 1; j < lines.length && block.length < 40; j += 1) {
      const line = lines[j]
      const depth = line.length - line.trimStart().length
      if (line.trim() !== '' && depth <= indent && !/^\s*\.\.\.$/.test(line)) break
      block.push(line.slice(indent))
    }
    failures.push({ name: match[2], text: block.join('\n') })
  }
  // A failing file also reports its parent tests: keep the innermost (most precise) ones.
  return failures.filter((failure) => !failures.some((other) => other !== failure && other.text.length < failure.text.length && failure.text.includes(other.text.split('\n')[0])))
}

const pack = (items) => {
  if (items.length <= MAX_ANNOTATIONS) return items
  const head = items.slice(0, MAX_ANNOTATIONS - 1)
  const rest = items.slice(MAX_ANNOTATIONS - 1)
  return [...head, { name: `${rest.length} more failures`, text: rest.map((item) => item.text.split('\n')[0]).join('\n') }]
}

const main = ([mode, path, count]) => {
  const lines = clean(readFileSync(path, 'utf8'))
  if (mode === 'node-test') {
    const failures = failingTests(lines)
    if (failures.length === 0) annotate('Tests failed', lines.filter(Boolean).slice(-60).join('\n'))
    for (const failure of pack(failures)) annotate(failure.name, failure.text)
    return 0
  }
  if (mode === 'tail') {
    const meaningful = lines.filter((line) => line && !/^\s+at /.test(line))
    // Stryker's initial test run lists the tests that failed in its sandbox: all of them.
    const dryRun = meaningful.findIndex((line) => /One or more tests failed in the initial test run/.test(line))
    if (dryRun >= 0) {
      const block = meaningful.slice(dryRun).join('\n')
      for (let start = 0, part = 1; start < block.length && part < MAX_ANNOTATIONS; start += MAX_CHARS, part += 1) {
        annotate(`Stryker initial test run (${part})`, block.slice(start, start + MAX_CHARS))
      }
      return 0
    }
    annotate(`Last lines of ${path}`, meaningful.slice(-(Number(count) || 60)).join('\n'))
    return 0
  }
  console.error('usage: ci-failure-annotations.mjs node-test|tail <log> [n]')
  return 2
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('ci-failure-annotations.mjs')) {
  process.exitCode = main(process.argv.slice(2))
}
