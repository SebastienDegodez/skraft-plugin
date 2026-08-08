#!/usr/bin/env node
// Which skill(s) a PR actually changed — so CI only pays the model-call cost of
// evaluating those, not the whole catalogue.
//
//   node eng/detect-changed-skills.mjs --base <sha> [--head <sha>]
//
// Prints one skill name per line, or nothing when the PR touches no skill.
import { execFileSync } from 'node:child_process'
import { parseArgs } from 'node:util'

import { changedSkills } from './lib/changed-skills.mjs'

const { values } = parseArgs({
  options: {
    base: { type: 'string' },
    head: { type: 'string', default: 'HEAD' },
    help: { type: 'boolean', default: false },
  },
  strict: true,
})

if (values.help || !values.base) {
  console.log('Usage: node eng/detect-changed-skills.mjs --base <sha> [--head <sha>]')
  process.exit(values.help ? 0 : 2)
}

const diff = execFileSync('git', ['diff', '--name-only', values.base, values.head], { encoding: 'utf8' })
const changedPaths = diff.split('\n').filter(Boolean)

for (const skill of changedSkills(changedPaths)) console.log(skill)
