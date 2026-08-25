#!/usr/bin/env node
// Check that every path an experiment file points at actually exists.
//
// `vally experiment run --dry-run` validates the structure and the `vary`
// invariant, but not the targets: a mistyped skill path resolves to nothing and
// the arm runs with no skill mounted. Downstream that is indistinguishable from
// "the skill did not help" — the arm scores like its control, the tally reads as
// a tie, and the conclusion is drawn from an instrument that was never
// assembled. It is the worst failure mode this comparison has, and it is silent,
// so it is worth a check that costs nothing.
//
//   node eng/check-experiment-paths.mjs [glob-dir]
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const root = process.argv[2] ?? 'eng/experiments'
const files = existsSync(root) ? readdirSync(root).filter((name) => name.endsWith('.experiment.yaml')) : []

if (!files.length) {
  console.log(`No experiment file under ${root}.`)
  process.exit(0)
}

// Deliberately not a YAML parse: the only thing under test is whether the
// paths on disk match the paths written down, and a regex over the raw text
// cannot itself be fooled by a loader that silently drops an unknown key.
const PATH_LINE = /^\s*-\s+(\.{1,2}\/\S+)\s*$/gm

let failures = 0
for (const name of files) {
  const file = join(root, name)
  const base = dirname(resolve(file))
  const text = readFileSync(file, 'utf8')

  for (const [, relative] of text.matchAll(PATH_LINE)) {
    const target = resolve(base, relative)
    // Split on the shape of the path, not on a directory name: eval specs live
    // under tests/skills/ too, so a `/skills/` test would send them looking for
    // a SKILL.md inside a YAML file. An eval is a file; a skill is a directory
    // that has to carry SKILL.md to be one at all.
    const ok = /\.ya?ml$/.test(relative) ? existsSync(target) : existsSync(join(target, 'SKILL.md'))
    if (!ok) {
      console.log(`::error file=${file}::${relative} does not exist`)
      failures += 1
    }
  }
}

console.log(
  failures
    ? `${failures} unresolved path(s) across ${files.length} experiment file(s).`
    : `Every path resolves across ${files.length} experiment file(s).`,
)
process.exit(failures ? 1 : 0)
