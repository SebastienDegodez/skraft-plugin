#!/usr/bin/env node
// Which evaluation subject(s) a PR actually changed — so CI only pays the
// model-call cost of evaluating those, not the whole catalogue.
//
//   node eng/detect-changed-skills.mjs --base <sha> [--head <sha>] [--kind skills|agents]
//
// Prints one name per line, or nothing when the PR touches no subject of that kind.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { changedAgentSuites, changedSkills } from './lib/changed-skills.mjs'

const { values } = parseArgs({
  options: {
    base: { type: 'string' },
    head: { type: 'string', default: 'HEAD' },
    kind: { type: 'string', default: 'skills' },
    help: { type: 'boolean', default: false },
  },
  strict: true,
})

if (values.help || !values.base || !['skills', 'agents'].includes(values.kind)) {
  console.log('Usage: node eng/detect-changed-skills.mjs --base <sha> [--head <sha>] [--kind skills|agents]')
  process.exit(values.help ? 0 : 2)
}

const diff = execFileSync('git', ['diff', '--name-only', values.base, values.head], { encoding: 'utf8' })
const changedPaths = diff.split('\n').filter(Boolean)

if (values.kind === 'skills') {
  for (const skill of changedSkills(changedPaths)) console.log(skill)
} else {
  const suitesRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../tests/agents'))
  const suites = existsSync(suitesRoot)
    ? readdirSync(suitesRoot).filter((entry) => existsSync(join(suitesRoot, entry, 'eval.yaml')))
    : []
  for (const suite of changedAgentSuites(changedPaths, { suites })) console.log(suite)
}
