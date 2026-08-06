import { strictEqual } from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it } from 'node:test'
import { execFileSync } from 'node:child_process'

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'))
let workspace
let fakeVally
let callsPath
let resultsPath

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'skraft-vally-runner-'))
  fakeVally = join(workspace, 'vally')
  callsPath = join(workspace, 'calls.log')
  resultsPath = join(workspace, 'results')
  writeFileSync(fakeVally, `#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$FAKE_CALLS"
output_dir=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--output-dir" ]]; then output_dir="$2"; shift 2; else shift; fi
done
mkdir -p "$output_dir/run"
printf '%s\n' '{"type":"trial-result","status":"success"}' '{"type":"run-summary","passed":true}' > "$output_dir/run/results.jsonl"
`)
  chmodSync(fakeVally, 0o755)
})

after(() => rmSync(workspace, { recursive: true, force: true }))

describe('unified Vally runner', () => {
  it('runs an agent suite through the custom executor from the same entry point used for skills', () => {
    execFileSync('bash', [join(repoRoot, 'eng/run-vally-evals.sh'), 'agents', 'agent-behavior'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        COPILOT_GITHUB_TOKEN: 'test-token',
        VALLY: fakeVally,
        FAKE_CALLS: callsPath,
        RESULTS_DIR: resultsPath,
      },
    })

    const calls = readFileSync(callsPath, 'utf8').trim().split(/\r?\n/)
    strictEqual(calls.length, 1)
    strictEqual(calls[0].includes(`--eval-spec ${join(repoRoot, 'tests/agents/agent-behavior/eval.yaml')}`), true)
    strictEqual(calls[0].includes(`--skill-dir ${join(repoRoot, 'plugins/skraft-framework/skills')}`), true)
    strictEqual(calls[0].includes(`--executor-plugin ${join(repoRoot, 'eng/vally-agent-executor/plugin.mjs')}`), true)
    strictEqual(calls[0].includes('--model'), false)
    strictEqual(calls[0].includes('--runs'), false)
    strictEqual(calls[0].includes('--grader-plugin'), false)
  })
})
