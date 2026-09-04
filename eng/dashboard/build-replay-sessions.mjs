#!/usr/bin/env node
// Flatten Vally session logs into an AGENTVIZ-replayable session set.
//
// Vally records every trial's raw agent trajectory as sibling
// `{metadata.json,events.jsonl}` files. Depending on the executor/version they
// live either directly under the trial directory or below an
// `executor-session-logs` directory. AGENTVIZ
// (https://github.com/jayparikh/agentviz) replays those events interactively,
// in static manifest mode: one manifest.json listing named, tagged sessions.
//
// This script derives skill / scenario / role from each trial's metadata, copies
// the events file under a readable name, and merges it into the manifest.
//
//   node eng/dashboard/build-replay-sessions.mjs --results-dir <dir> --output-dir <dir> \
//     [--source scheduled|pr] [--pr-number N] [--date YYYY-MM-DD] \
//     [--expected-result <file> ...] [--strict]
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { ROLE_BY_VARIANT, sessionEntry, sessionSubDirectory, skillOf, slug, variantFromPath } from '../lib/replay-sessions.mjs'

const { values } = parseArgs({
  options: {
    'results-dir': { type: 'string' },
    'output-dir': { type: 'string' },
    source: { type: 'string', default: 'scheduled' },
    'pr-number': { type: 'string', default: '0' },
    date: { type: 'string' },
    'expected-result': { type: 'string', multiple: true, default: [] },
    strict: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
  strict: true,
})

if (values.help || !values['results-dir'] || !values['output-dir']) {
  console.log('Usage: node eng/dashboard/build-replay-sessions.mjs --results-dir <dir> --output-dir <dir> [--source scheduled|pr] [--pr-number N] [--date YYYY-MM-DD] [--expected-result <file> ...] [--strict]')
  process.exit(values.help ? 0 : 2)
}

const posix = (value) => value.split('\\').join('/')

/** Every metadata.json with a sibling events.jsonl, at any depth. */
const findSessionMetadata = (root, found = []) => {
  if (!existsSync(root)) return found
  for (const entry of readdirSync(root).sort()) {
    const path = join(root, entry)
    if (statSync(path).isDirectory()) findSessionMetadata(path, found)
    else if (entry === 'metadata.json' && existsSync(join(dirname(path), 'events.jsonl'))) found.push(path)
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
const manifestPath = join(outputDir, 'manifest.json')

if (source === 'pr' && prNumber <= 0) {
  console.error('A positive --pr-number is required when --source is pr.')
  process.exit(2)
}

const previousManifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { sessions: [] }
const currentPrefix = `sessions/${posix(subDirectory)}/`
const retainedSessions = (previousManifest.sessions ?? []).filter(
  (session) => !String(session.url ?? '').startsWith(currentPrefix) && existsSync(join(outputDir, session.url)),
)

// Re-running one PR or scheduled date replaces that run only. Sessions from
// other PRs/dates remain available until the retention pass removes them.
rmSync(sessionsDir, { recursive: true, force: true })
mkdirSync(sessionsDir, { recursive: true })

const metadataFiles = findSessionMetadata(resultsDir)
console.log(`Scanning ${resultsDir}: ${metadataFiles.length} session metadata file(s)`)

const usedNames = new Map()
const sessions = []
const extractedMetadataFiles = []

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

  // Isolated Vally 0.12 runs stamp the generic variant `main` in both arms.
  // The runner's baseline/skilled output directory is the authoritative arm.
  const variant = variantFromPath(metadataFile) || String(metadata.variant ?? '')
  const role = ROLE_BY_VARIANT[variant] ?? (variant ? slug(variant) : 'unknown')
  const skill = slug(skillOf(metadata.evalFilePath ?? metadata.evalName ?? ''))
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
  extractedMetadataFiles.push(metadataFile)
  sessions.push(sessionEntry({ skill, stimulusName, role, trialIndex, fileName, subDirectory, source, prNumber, date, mtime: stats.mtimeMs }))
  console.log(`  ${skill}/${fileName} (${Math.max(1, Math.round(stats.size / 1024))} KB)`)
}

if (values.strict) {
  const expectedResults = values['expected-result'].map((path) => resolve(path))
  const uncoveredResults = expectedResults.filter((resultPath) => {
    const runDirectory = dirname(resultPath)
    return !extractedMetadataFiles.some((metadataPath) => {
      const pathFromRun = relative(runDirectory, metadataPath)
      return pathFromRun !== '' && !pathFromRun.startsWith('..') && !isAbsolute(pathFromRun)
    })
  })

  if (expectedResults.length === 0 || uncoveredResults.length > 0) {
    console.error(`Refusing to publish verdicts without trajectories for ${uncoveredResults.join(', ') || 'any result file'}.`)
    process.exit(1)
  }
}

const mergedSessions = [...retainedSessions, ...sessions]
writeFileSync(manifestPath, `${JSON.stringify({ generated: new Date().toISOString(), sessions: mergedSessions }, null, 2)}\n`)
console.log(`Manifest written with ${mergedSessions.length} session(s) (${sessions.length} from this run) → ${manifestPath}`)
if (sessions.length === 0) console.warn('⚠ No session was extracted; existing replay sessions were preserved.')
