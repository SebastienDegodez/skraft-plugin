#!/usr/bin/env node
// Zero-dependency artifact template renderer.
//
// Renders a Mustache-subset template (see scripts/lib/render.mjs) against a data
// file, so agents emit only the data — not the structural boilerplate.
//
// Data is YAML (.yml / .yaml) or JSON (.json). YAML is preferred: it is lighter
// for an agent to emit. Format is chosen by extension; when unknown the loader
// tries JSON first, then YAML.
//
//   node scripts/render-template.mjs --template <path> --data <path> [--out <path>]
//
//   --template <path>   Mustache-subset template file (required)
//   --data <path>       YAML or JSON data file (required)
//   --out <path>        write rendered output here; omit to print to stdout
//   --help, -h          show this help
//
// Exit codes: 0 success · 1 usage / read / parse / render error.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, extname } from 'node:path'
import { render } from './lib/render.mjs'
import { parseYaml } from './lib/book.mjs'

const HELP = `Usage: node scripts/render-template.mjs --template <path> --data <path> [--out <path>]

  --template <path>   Mustache-subset template file (required)
  --data <path>       YAML or JSON data file (required)
  --out <path>        write rendered output (default: stdout)
  --help, -h          show this help
`

// Parse the data file as YAML or JSON, chosen by extension (unknown → JSON then YAML).
const parseData = (path, text) => {
  const ext = extname(path).toLowerCase()
  if (ext === '.yml' || ext === '.yaml') return parseYaml(text)
  if (ext === '.json') return JSON.parse(text)
  try {
    return JSON.parse(text)
  } catch {
    return parseYaml(text)
  }
}

const parseArgs = (argv) => {
  const opts = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') return { help: true }
    if (arg === '--template' || arg === '--data' || arg === '--out') {
      const value = argv[i + 1]
      if (value == null) fail(`Missing value for ${arg}`)
      opts[arg.slice(2)] = value
      i += 1
      continue
    }
    fail(`Unknown argument: ${arg}`)
  }
  return opts
}

const fail = (msg) => {
  process.stderr.write(`render-template: ${msg}\n`)
  process.exit(1)
}

const main = () => {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    process.stdout.write(HELP)
    return
  }
  if (!opts.template) fail('--template is required')
  if (!opts.data) fail('--data is required')

  let template
  try {
    template = readFileSync(opts.template, 'utf8')
  } catch (err) {
    fail(`cannot read template: ${err.message}`)
  }

  let data
  try {
    data = parseData(opts.data, readFileSync(opts.data, 'utf8'))
  } catch (err) {
    fail(`cannot read/parse data: ${err.message}`)
  }

  let output
  try {
    output = render(template, data)
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
