#!/usr/bin/env node
// Writes a state.json the run-pipeline use case already validated, through the CLI's
// atomic writer (temp file, rotated backup, rename). Used by the Claude Code mod, whose
// sandbox can read files but cannot rename them.
//
//   node src/cli/state-io.mjs write --root <trackingRoot> --slug <slug>   < state.json on stdin
//
// Exit: 0 written, 1 refused (invalid state), 2 IO error, 3 usage.
import { createJsonStateWriter } from '../adapters/infrastructure/state/json-state-writer.mjs'
import { validatePipelineState } from '../domain/state-schema.mjs'

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const argv = process.argv.slice(2)
const flag = (name) => {
  const at = argv.indexOf(`--${name}`)
  return at >= 0 ? argv[at + 1] : undefined
}

const usage = (reason) => {
  process.stderr.write(`state-io: ${reason}\nusage: state-io.mjs write --root <trackingRoot> --slug <slug> < state.json\n`)
  process.exit(3)
}

if (argv[0] !== 'write') usage('unknown command')
const root = flag('root')
const slug = flag('slug')
if (!root) usage('--root is required')
if (!SLUG.test(slug ?? '')) usage('--slug must be kebab-case')

let input = ''
for await (const chunk of process.stdin) input += chunk

let state
try { state = JSON.parse(input) } catch (error) {
  process.stderr.write(`state-io: stdin is not JSON: ${error.message}\n`)
  process.exit(1)
}
const valid = validatePipelineState(state)
if (!valid.ok) {
  process.stderr.write(`state-io: ${valid.error.reason}\n`)
  process.exit(1)
}
const written = await createJsonStateWriter(root).write(slug, state)
if (!written.ok) {
  process.stderr.write(`state-io: ${written.error?.reason ?? written.error?.code ?? 'write failed'}\n`)
  process.exit(2)
}
