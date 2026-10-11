#!/usr/bin/env node
// v1/v2 non-regression harness entry point. See eng/regression/README.md.
//   compare    --v1 <dir> --v2 <dir> [--fixture name] [--waivers file] [--out report.md] [--json]
//              [--duration-pct 25] [--cost-pct 25]
//   prepare-v1 --dir <worktreePath> [--ref main]
// Exit: 0 no unwaived regression, 1 unwaived regression, 2 usage or input error.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { readTrackingFolder } from './tracking-folder.mjs'
import { compareSummaries } from './compare.mjs'
import { renderMarkdown, exitCode, parseWaivers } from './report.mjs'

// Every thrown error is a usage or input problem: exit 2, distinct from 1 (regression).
class UsageError extends Error {}

const need = (values, name) => {
  if (typeof values[name] !== 'string' || values[name] === '') throw new UsageError(`missing --${name}`)
  return values[name]
}

const pct = (raw, name) => {
  if (raw === undefined) return undefined
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) throw new UsageError(`--${name} must be a non-negative number`)
  return n
}

const compare = (args) => {
  const { values } = parseArgs({
    args,
    options: {
      v1: { type: 'string' },
      v2: { type: 'string' },
      fixture: { type: 'string' },
      waivers: { type: 'string' },
      out: { type: 'string' },
      json: { type: 'boolean', default: false },
      'duration-pct': { type: 'string' },
      'cost-pct': { type: 'string' },
    },
  })
  const v1Dir = resolve(need(values, 'v1'))
  const v2Dir = resolve(need(values, 'v2'))
  const fixture = values.fixture ?? basename(v1Dir)
  const thresholds = Object.fromEntries(
    [['durationPct', pct(values['duration-pct'], 'duration-pct')], ['costPct', pct(values['cost-pct'], 'cost-pct')]].filter(([, v]) => v !== undefined),
  )

  let v1, v2, waivers
  try {
    v1 = readTrackingFolder(v1Dir).summary
    v2 = readTrackingFolder(v2Dir).summary
    if (values.waivers && !existsSync(values.waivers)) throw new Error(`waivers file not found: ${values.waivers}`)
    waivers = values.waivers ? parseWaivers(readFileSync(values.waivers, 'utf8')) : []
  } catch (err) {
    throw new UsageError(err.message)
  }

  const findings = compareSummaries(v1, v2, thresholds)
  const text = values.json ? `${JSON.stringify(findings, null, 2)}\n` : renderMarkdown(findings, { fixture, waivers })
  if (values.out) writeFileSync(values.out, text, 'utf8')
  else process.stdout.write(text)
  return exitCode(findings, { fixture, waivers })
}

const prepareV1 = (args) => {
  const { values } = parseArgs({ args, options: { ref: { type: 'string', default: 'main' }, dir: { type: 'string' } } })
  const dir = resolve(need(values, 'dir'))
  if (existsSync(dir)) throw new UsageError(`${dir} already exists; remove it with "git worktree remove" first`)
  const res = spawnSync('git', ['worktree', 'add', '--detach', dir, values.ref], { stdio: 'inherit' })
  if (res.error) throw new UsageError(`git not runnable: ${res.error.message}`)
  return res.status === 0 ? 0 : 2
}

const COMMANDS = { compare, 'prepare-v1': prepareV1 }

const main = (argv) => {
  const [command, ...rest] = argv
  const handler = COMMANDS[command]
  if (!handler) throw new UsageError(`usage: cli.mjs <${Object.keys(COMMANDS).join('|')}> [options]`)
  return handler(rest)
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (err) {
  process.stderr.write(`${err.message}\n`)
  process.exitCode = 2
}
