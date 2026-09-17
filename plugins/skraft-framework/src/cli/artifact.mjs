#!/usr/bin/env node
// SKRAFT artifact mini-command CLI — the shipped counterpart to the dev-only
// scripts/artifact.mjs, resolvable at runtime as `${CLAUDE_PLUGIN_ROOT}/src/cli/artifact.mjs`
// (see plugins/skraft-framework/com.github.copilot/agents/*.agent.md and plugins/skraft-framework/com.github.copilot/rules/skraft-state.instructions.md).
//
// A dedicated subcommand per artifact type. The subcommand OWNS the template and
// the required-field schema (see ../domain/artifact-registry.mjs), so an agent emits
// only the data — as a safe quoted heredoc on stdin — and never repeats template
// paths or structural boilerplate.
//
//   node artifact.mjs <type> [--out <path>] [--data <file>]
//
//   <type>            artifact type (e.g. adr)
//   --out <path>      write rendered output here; omit to print to stdout
//   --data <file>     read the YAML/JSON payload from a file instead of stdin
//   --help, -h        show this help
//
// Payload: YAML (preferred) or JSON. Read from stdin unless --data is given.
//
// Exit codes:
//   0  success
//   1  usage / read / render error
//   2  validation failed — a JSON error is printed to stderr listing the missing
//      required fields, so the calling agent can fill them and re-run.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseYaml } from '../domain/yaml-parser.mjs'
import { ARTIFACTS, validate } from '../domain/artifact-registry.mjs'
import { renderArtifact } from '../application/render-artifact.mjs'

// Resolve the plugin root the same way regardless of install location: this file
// always lives at {pluginRoot}/src/cli/artifact.mjs.
const pluginRoot = fileURLToPath(new URL('../..', import.meta.url))
const readTemplate = (templatePath) => readFileSync(join(pluginRoot, templatePath), 'utf8')

const HELP = `Usage: node artifact.mjs <type> [--out <path>] [--data <file>]

  <type>          artifact type: ${Object.keys(ARTIFACTS).join(', ')}
  --out <path>    write rendered output (default: stdout)
  --data <file>   read the YAML/JSON payload from a file instead of stdin
  --help, -h      show this help

The payload is read from stdin (a quoted heredoc) unless --data is given.
`

const fail = (msg) => {
  process.stderr.write(`artifact: ${msg}\n`)
  process.exit(1)
}

// Emit a machine-readable validation error the calling agent can parse + correct.
const failValidation = (result) => {
  process.stderr.write(
    JSON.stringify({
      error: result.unknownType ? 'unknown_artifact_type' : 'missing_required_fields',
      artifact: result.type,
      missing: result.missing,
      known_types: Object.keys(ARTIFACTS),
    }) + '\n',
  )
  process.exit(2)
}

const parseArgs = (argv) => {
  const opts = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') return { help: true }
    if (arg === '--out' || arg === '--data') {
      const value = argv[i + 1]
      if (value == null) fail(`Missing value for ${arg}`)
      opts[arg.slice(2)] = value
      i += 1
      continue
    }
    if (arg.startsWith('--')) fail(`Unknown argument: ${arg}`)
    if (opts.type) fail(`Unexpected extra argument: ${arg}`)
    opts.type = arg
  }
  return opts
}

// Parse a YAML/JSON payload. Extension picks the format for --data; stdin is
// tried as JSON first then YAML.
const parsePayload = (text, path) => {
  const ext = path ? extname(path).toLowerCase() : ''
  if (ext === '.json') return JSON.parse(text)
  if (ext === '.yml' || ext === '.yaml') return parseYaml(text)
  try {
    return JSON.parse(text)
  } catch {
    return parseYaml(text)
  }
}

const main = () => {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help || !opts.type) {
    process.stdout.write(HELP)
    return
  }
  if (!ARTIFACTS[opts.type]) failValidation({ unknownType: true, type: opts.type, missing: [] })

  let raw
  if (opts.data) {
    try {
      raw = readFileSync(opts.data, 'utf8')
    } catch (err) {
      fail(`cannot read data file: ${err.message}`)
    }
  } else {
    if (process.stdin.isTTY) fail('no payload: provide YAML/JSON via stdin or use --data <file>')
    try {
      raw = readFileSync(0, 'utf8')
    } catch (err) {
      fail(`cannot read stdin: ${err.message}`)
    }
  }

  let data
  try {
    data = parsePayload(raw, opts.data)
  } catch (err) {
    fail(`cannot parse payload: ${err.message}`)
  }

  const result = validate(opts.type, data)
  if (!result.ok) failValidation(result)

  let output
  try {
    output = renderArtifact(opts.type, data, { readTemplate })
  } catch (err) {
    fail(`render error: ${err.message}`)
  }

  if (opts.out) {
    mkdirSync(dirname(opts.out), { recursive: true })
    writeFileSync(opts.out, output)
  } else {
    process.stdout.write(output)
  }
}

main()
