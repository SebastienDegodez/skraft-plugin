#!/usr/bin/env node
// Records a human's answer to a pipeline checkpoint, for any host: the next run (or the
// resumed Copilot workflow run) reads it instead of asking again. Composition root of
// the RecordDecision use case.
//
//   node src/cli/decide.mjs --slug checkout --key adr-ratification:007 --answer "accept all"
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRecordDecision } from '../application/pipeline/record-decision.mjs'
import { createNodePipelineDependencies } from '../adapters/api/pipeline/node-dependencies.mjs'
import { decisionPath } from '../adapters/infrastructure/pipeline/tracking-decision-store.mjs'

const argv = process.argv.slice(2)
const flag = (name) => {
  const at = argv.indexOf(`--${name}`)
  return at >= 0 ? argv[at + 1] : undefined
}

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const { decisionStore, trackingStore } = createNodePipelineDependencies({ cwd: process.cwd(), pluginRoot })
const slug = flag('slug')
const recorded = await createRecordDecision({ decisionStore }).record({ slug, key: flag('key'), answer: flag('answer') })
if (!recorded.ok) {
  process.stderr.write(`decide: ${recorded.error.reason}\nusage: decide.mjs --slug <slug> --key <checkpoint key> --answer "<answer>"\n`)
  process.exit(3)
}
process.stdout.write(`${trackingStore.prefix(slug)}${decisionPath(recorded.value.key)}\n`)
