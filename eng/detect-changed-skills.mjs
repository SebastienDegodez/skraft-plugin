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

const specNames = (root) =>
  existsSync(root) ? readdirSync(root).filter((entry) => existsSync(join(root, entry, 'eval.yaml'))) : []

const testsRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../tests'))

if (values.kind === 'skills') {
  // Only skills that actually carry a spec: see `changedSkills` for why naming
  // an unrunnable one takes the whole job down with it.
  const evaluable = specNames(join(testsRoot, 'skills'))
  for (const skill of changedSkills(changedPaths, { evaluable })) console.log(skill)
} else {
  const suites = specNames(join(testsRoot, 'agents'))
  for (const suite of changedAgentSuites(changedPaths, { suites })) console.log(suite)
}
