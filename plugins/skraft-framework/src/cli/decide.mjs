#!/usr/bin/env node
// Records a human's answer to a pipeline checkpoint, for any host: the next run (or the
// resumed Copilot workflow run) reads it instead of asking again.
//
//   node src/cli/decide.mjs --slug checkout --key adr-ratification:007 --answer "accept all"
import { resolveTrackingRoot } from '../adapters/infrastructure/tracking-root-resolver.mjs'
import { createNodeHostPorts } from '../adapters/hosts/node-host-ports.mjs'
import { createDecisionInbox, decisionPath } from '../application/pipeline/decision-inbox.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const argv = process.argv.slice(2)
const flag = (name) => {
  const at = argv.indexOf(`--${name}`)
  return at >= 0 ? argv[at + 1] : undefined
}
const slug = flag('slug')
const key = flag('key')
const answer = flag('answer')
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug ?? '') || !key || !answer) {
  process.stderr.write('usage: decide.mjs --slug <slug> --key <checkpoint key> --answer "<answer>"\n')
  process.exit(3)
}

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const ports = createNodeHostPorts({ cwd: process.cwd(), pluginRoot })
await createDecisionInbox({ trackingFiles: ports.trackingFiles, slug }).write(key, answer)
process.stdout.write(`${join(resolveTrackingRoot(), slug, decisionPath(key))}\n`)
