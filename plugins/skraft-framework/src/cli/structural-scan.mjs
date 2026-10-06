#!/usr/bin/env node
// Deterministic scan of the structural commitments the existing code carries (DESIGN
// Step 7.0 signatures). Prints — or writes with --out — one JSON report.
// Thin driving adapter of the StructuralScan use case, which RunPipeline runs in process
// before the architect; this command stays for the architect reviewer.
// Exit: 0 report produced · 3 usage error.
//
//   node "$SKRAFT_PLUGIN_ROOT/src/cli/structural-scan.mjs" [--root <repo>] [--out <path>]
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createStructuralScan } from '../application/structural-scan-service.mjs'
import { createNodeSourceControl } from '../adapters/infrastructure/git/node-source-control.mjs'
import { createNodeSourceTree } from '../adapters/infrastructure/source-tree/node-source-tree.mjs'
import { createSystemTime } from '../adapters/infrastructure/system-time.mjs'

let values
try {
  ({ values } = parseArgs({ options: { root: { type: 'string' }, out: { type: 'string' } } }))
} catch (error) {
  process.stderr.write(`${error.message}\nusage: structural-scan.mjs [--root <repo>] [--out <path>]\n`)
  process.exit(3)
}

const root = resolve(values.root ?? process.cwd())
const scan = createStructuralScan({
  sourceTree: createNodeSourceTree({ cwd: root }),
  sourceControl: createNodeSourceControl({ cwd: root }),
  time: createSystemTime(),
})
const report = `${JSON.stringify(await scan.scan(), null, 2)}\n`

if (values.out) {
  const out = resolve(root, values.out)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, report)
  process.stdout.write(`${relative(root, out).split('\\').join('/')}\n`)
} else {
  process.stdout.write(report)
}
