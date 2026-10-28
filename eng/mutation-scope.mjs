#!/usr/bin/env node
// Mutation testing of what a change touched: the engine lines added or changed since the merge
// base with the branch it targets, honouring the `mutate` patterns of the Stryker configuration.
//
//   node eng/mutation-scope.mjs --base <ref> [--head <ref>]          print the targets, one per line
//   node eng/mutation-scope.mjs --base <ref> [--head <ref>] --run    run Stryker on them
//
// Without --head the working copy counts, uncommitted changes included. Run from the repository
// root, after `npm ci --prefix plugins/skraft-framework/engine` for --run.
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import { changedLines, mutateTargets } from './lib/mutation-scope.mjs'

const ENGINE = join('plugins', 'skraft-framework', 'engine')
const CONFIG = join(ENGINE, 'stryker.config.mjs')
const STRYKER = join(ENGINE, 'node_modules', '@stryker-mutator', 'core', 'bin', 'stryker.js')

const { values } = parseArgs({
  options: {
    base: { type: 'string' },
    head: { type: 'string' },
    run: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
  strict: true,
})

if (values.help || !values.base) {
  console.log('Usage: node eng/mutation-scope.mjs --base <ref> [--head <ref>] [--run]')
  process.exit(values.help ? 0 : 2)
}

/** @param {string[]} args */
const git = (args) => spawnSync('git', ['-c', 'core.quotepath=off', '-c', 'core.fsmonitor=false', ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })

const head = values.head ?? 'HEAD'
const mergeBase = git(['merge-base', values.base, head])
if (mergeBase.status !== 0) {
  process.stderr.write(`cannot find the merge base of ${values.base} and ${head}: ${mergeBase.stderr.trim() || `exit ${mergeBase.status}`}\n`)
  process.exit(2)
}

const diff = git(['diff', '-U0', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', '--src-prefix=a/', '--dst-prefix=b/',
  mergeBase.stdout.trim(), ...(values.head === undefined ? [] : [values.head]), '--', ENGINE.split('\\').join('/')])
if (diff.status !== 0) {
  process.stderr.write(`git diff failed: ${diff.stderr.trim()}\n`)
  process.exit(2)
}

const { default: config } = await import(pathToFileURL(join(process.cwd(), CONFIG)).href)
const targets = mutateTargets(changedLines(diff.stdout), config.mutate)

if (!values.run) {
  for (const target of targets) console.log(target)
  process.exit(0)
}
if (targets.length === 0) {
  console.log(`No engine line changed since ${values.base}: nothing to mutate.`)
  process.exit(0)
}
console.log(`Mutating ${targets.length} changed range(s) since ${values.base}.`)
const stryker = spawnSync(process.execPath, [STRYKER, 'run', CONFIG, '--mutate', targets.join(',')], { stdio: 'inherit' })
process.exit(stryker.status ?? 1)
