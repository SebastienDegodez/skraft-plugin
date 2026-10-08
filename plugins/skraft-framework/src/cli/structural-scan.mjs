#!/usr/bin/env node
// Deterministic scan of the structural commitments the existing code carries (DESIGN
// Step 7.0 signatures). Prints — or writes with --out — one JSON report.
// Exit: 0 report produced · 3 usage error.
//
//   node "$SKRAFT_PLUGIN_ROOT/src/cli/structural-scan.mjs" [--root <repo>] [--out <path>]
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { isScannableSource, scanSource, summariseScan } from '../domain/structural-scan-policy.mjs'

const MAX_FILE_BYTES = 1024 * 1024

let values
try {
  ({ values } = parseArgs({ options: { root: { type: 'string' }, out: { type: 'string' } } }))
} catch (error) {
  process.stderr.write(`${error.message}\nusage: structural-scan.mjs [--root <repo>] [--out <path>]\n`)
  process.exit(3)
}

const root = resolve(values.root ?? process.cwd())

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 })

// Tracked and untracked-but-not-ignored files; a directory walk outside Git.
const listFiles = () => {
  try {
    return git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(Boolean)
  } catch {
    return readdirSync(root, { recursive: true }).map((entry) => String(entry).split('\\').join('/'))
  }
}

const revision = (() => {
  try { return git('rev-parse', 'HEAD').trim() } catch { return null }
})()

const files = listFiles().filter(isScannableSource)
const hits = files.flatMap((path) => {
  try {
    const absolute = join(root, path)
    const stat = statSync(absolute)
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return []
    return scanSource(path, readFileSync(absolute, 'utf8'))
  } catch {
    return []
  }
})

const report = JSON.stringify({ generatedAt: new Date().toISOString(), ...summariseScan(hits, { revision, scannedFiles: files.length }) }, null, 2) + '\n'

if (values.out) {
  const out = resolve(root, values.out)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, report)
  process.stdout.write(`${relative(root, out).split('\\').join('/')}\n`)
} else {
  process.stdout.write(report)
}
