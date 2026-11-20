#!/usr/bin/env node
// Compares two results.jsonl files of the same agent suite run at two refs.
//
//   node eng/compare-agent-ab.mjs --control <results.jsonl> --candidate <results.jsonl> \
//     [--control-ref main] [--candidate-ref perf/x] [--out report.json] [--markdown report.md]
//
// Exit code: 0 improved or no-gain, 3 quality-regression, 4 errored, 2 usage error.

import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

import { compareAgentArms, renderAgentComparison } from './lib/agent-ab.mjs'

const { values } = parseArgs({
  options: {
    control: { type: 'string' },
    candidate: { type: 'string' },
    'control-ref': { type: 'string', default: 'control' },
    'candidate-ref': { type: 'string', default: 'candidate' },
    out: { type: 'string' },
    markdown: { type: 'string' },
  },
})

if (!values.control || !values.candidate) {
  console.error('Usage: compare-agent-ab.mjs --control <results.jsonl> --candidate <results.jsonl>')
  process.exit(2)
}

const readJsonl = (path) =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .flatMap((line) => {
      try {
        return [JSON.parse(line)]
      } catch {
        return []
      }
    })

const comparison = compareAgentArms({ control: readJsonl(values.control), candidate: readJsonl(values.candidate) })
const markdown = renderAgentComparison(comparison, {
  controlRef: values['control-ref'],
  candidateRef: values['candidate-ref'],
})

if (values.out) writeFileSync(values.out, `${JSON.stringify(comparison, null, 2)}\n`)
if (values.markdown) writeFileSync(values.markdown, markdown)
process.stdout.write(markdown)
process.exit({ 'quality-regression': 3, errored: 4 }[comparison.verdict] ?? 0)
