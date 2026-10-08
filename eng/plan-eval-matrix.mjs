#!/usr/bin/env node
// Which evaluation subjects CI should run, as a GitHub Actions matrix — one
// runner per subject, so evaluations run side by side.
//
//   node eng/plan-eval-matrix.mjs --base <sha> [--head <sha>]   # what a PR changed
//   node eng/plan-eval-matrix.mjs --all                         # every spec
//   node eng/plan-eval-matrix.mjs --subject <name>              # one skill or agent suite
//   add --skills-only to leave agent suites out (model comparison)
//
// Prints `{"include":[...]}` on stdout. Subjects on the skip list are left out
// and reported on stderr; SKIP_EVALS overrides the file exactly as it does for
// eng/run-vally-evals.sh (set to "" to skip nothing).
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { changedAgentSuites, changedSkills } from './lib/changed-skills.mjs'
import { evalMatrix, parseSkipList } from './lib/eval-matrix.mjs'

const { values } = parseArgs({
  options: {
    base: { type: 'string' },
    head: { type: 'string', default: 'HEAD' },
    all: { type: 'boolean', default: false },
    subject: { type: 'string' },
    'skills-only': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
  strict: true,
})

const modes = [values.base != null, values.all, values.subject != null].filter(Boolean).length
if (values.help || modes !== 1) {
  console.log('Usage: node eng/plan-eval-matrix.mjs (--base <sha> [--head <sha>] | --all | --subject <name>) [--skills-only]')
  process.exit(values.help ? 0 : 2)
}

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'))
const testsRoot = join(repoRoot, 'tests')

const specNames = (root) =>
  existsSync(root) ? readdirSync(root).filter((entry) => existsSync(join(root, entry, 'eval.yaml'))).sort() : []

const allSkills = specNames(join(testsRoot, 'skills'))
const allAgents = specNames(join(testsRoot, 'agents'))

let skills
let agents
if (values.all) {
  skills = allSkills
  agents = allAgents
} else if (values.subject != null) {
  const name = values.subject.trim()
  skills = allSkills.filter((skill) => skill === name)
  agents = allAgents.filter((suite) => suite === name)
  if (!skills.length && !agents.length) {
    console.error(`No eval spec for '${name}': expected tests/skills/${name}/eval.yaml or tests/agents/${name}/eval.yaml`)
    process.exit(1)
  }
} else {
  const diff = execFileSync('git', ['diff', '--name-only', values.base, values.head], { cwd: repoRoot, encoding: 'utf8' })
  const changedPaths = diff.split('\n').filter(Boolean)
  skills = changedSkills(changedPaths, { evaluable: allSkills })
  agents = changedAgentSuites(changedPaths, { suites: allAgents })
}
if (values['skills-only']) agents = []

const skipFile = join(repoRoot, 'eng/vally-adapter/skip-evals.txt')
const skip =
  process.env.SKIP_EVALS !== undefined
    ? parseSkipList(process.env.SKIP_EVALS)
    : existsSync(skipFile)
      ? parseSkipList(readFileSync(skipFile, 'utf8'))
      : []

const { include, skipped } = evalMatrix({ skills, agents, skip })
for (const name of skipped) console.error(`::notice::Skipping ${name} (in skip-evals.txt)`)
console.log(JSON.stringify({ include }))
