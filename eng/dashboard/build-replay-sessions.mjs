#!/usr/bin/env node
// Flatten Vally session logs into an AGENTVIZ-replayable session set.
//
// Vally records every trial's raw agent trajectory under
// `<runDir>/executor-session-logs/.../{metadata.json,events.jsonl}`. AGENTVIZ
// (https://github.com/jayparikh/agentviz) replays those events interactively,
// in static manifest mode: one manifest.json listing named, tagged sessions.
//
// This script derives skill / scenario / role from each trial's metadata, copies
// the events file under a readable name, and writes the manifest.
//
//   node eng/dashboard/build-replay-sessions.mjs --results-dir <dir> --output-dir <dir> \
//     [--source scheduled|pr] [--pr-number N] [--date YYYY-MM-DD]
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { ROLE_BY_VARIANT, sessionEntry, sessionSubDirectory, skillOf, slug } from '../lib/replay-sessions.mjs'

const { values } = parseArgs({
  options: {
    'results-dir': { type: 'string' },
    'output-dir': { type: 'string' },
    source: { type: 'string', default: 'scheduled' },
    'pr-number': { type: 'string', default: '0' },
    date: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
  strict: true,
})

if (values.help || !values['results-dir'] || !values['output-dir']) {
  console.log('Usage: node eng/dashboard/build-replay-sessions.mjs --results-dir <dir> --output-dir <dir> [--source scheduled|pr] [--pr-number N] [--date YYYY-MM-DD]')
  process.exit(values.help ? 0 : 2)
}

const posix = (value) => value.split('\\').join('/')

/** Every metadata.json under an executor-session-logs tree, at any depth. */
const findSessionMetadata = (root, found = []) => {
  if (!existsSync(root)) return found
  for (const entry of readdirSync(root).sort()) {
    const path = join(root, entry)
    if (statSync(path).isDirectory()) findSessionMetadata(path, found)
    else if (entry === 'metadata.json' && posix(path).includes('/executor-session-logs/')) found.push(path)
  }
  return found
}

const resultsDir = resolve(values['results-dir'])
const outputDir = resolve(values['output-dir'])
const source = values.source === 'pr' ? 'pr' : 'scheduled'
const prNumber = Number.parseInt(values['pr-number'], 10) || 0
const date = values.date ?? new Date().toISOString().slice(0, 10)
const subDirectory = sessionSubDirectory({ source, prNumber, date })
const sessionsDir = join(outputDir, 'sessions', subDirectory)

mkdirSync(sessionsDir, { recursive: true })

const metadataFiles = findSessionMetadata(resultsDir)
console.log(`Scanning ${resultsDir}: ${metadataFiles.length} session metadata file(s)`)

const usedNames = new Map()
const sessions = []

for (const metadataFile of metadataFiles) {
  let metadata
  try {
    metadata = JSON.parse(readFileSync(metadataFile, 'utf8'))
  } catch (error) {
    console.warn(`⚠ ${metadataFile}: unreadable metadata (${error.message})`)
    continue
  }

  const eventsPath = join(dirname(metadataFile), 'events.jsonl')
  if (!existsSync(eventsPath) || statSync(eventsPath).size === 0) {
    console.warn(`⚠ ${metadataFile}: no non-empty sibling events.jsonl, skipping`)
    continue
  }

  const variant = String(metadata.variant ?? '')
  const role = ROLE_BY_VARIANT[variant] ?? (variant ? slug(variant) : 'unknown')
  const skill = skillOf(metadata.evalFilePath ?? metadata.evalName ?? '')
  const stimulusName = String(metadata.stimulusName ?? '')
  const trialIndex = String(metadata.trialIndex ?? 0)

  const skillDir = join(sessionsDir, skill)
  mkdirSync(skillDir, { recursive: true })

  const baseName = `${slug(stimulusName || skill)}--${role}--run${trialIndex}`
  const seen = usedNames.get(`${skill}/${baseName}`) ?? 0
  usedNames.set(`${skill}/${baseName}`, seen + 1)
  const fileName = seen === 0 ? `${baseName}.jsonl` : `${baseName}-${seen}.jsonl`

  const stats = statSync(eventsPath)
  copyFileSync(eventsPath, join(skillDir, fileName))
  sessions.push(sessionEntry({ skill, stimulusName, role, trialIndex, fileName, subDirectory, source, prNumber, date, mtime: stats.mtimeMs }))
  console.log(`  ${skill}/${fileName} (${Math.max(1, Math.round(stats.size / 1024))} KB)`)
}

writeFileSync(join(outputDir, 'manifest.json'), `${JSON.stringify({ generated: new Date().toISOString(), sessions }, null, 2)}\n`)
console.log(`Manifest written with ${sessions.length} session(s) → ${join(outputDir, 'manifest.json')}`)
if (sessions.length === 0) console.warn('⚠ No session was extracted; the replay view will be empty.')
