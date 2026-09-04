import { strictEqual } from 'node:assert/strict'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it } from 'node:test'
import { execFileSync } from 'node:child_process'

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'))
let workspace
let fakeVally
let callsPath
let discoveryPath
let resultsPath

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'skraft-vally-runner-'))
  fakeVally = join(workspace, 'vally')
  callsPath = join(workspace, 'calls.log')
  discoveryPath = `${callsPath}.discovery`
  resultsPath = join(workspace, 'results')
  // Recording the path handed to --skill-dir only proves the runner named a
  // directory. What matters is what Vally can discover inside it: it lists the
  // directory with readdir(withFileTypes), where a symlinked directory reports
  // as a symlink and is skipped, so an arm assembled from symlinks resolves to
  // zero skills and the treatment silently runs skill-free. The `! -L` guard
  // below reproduces that rule so the log records skills that are actually
  // reachable, not skill names that merely appear in a listing.
  writeFileSync(fakeVally, `#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$FAKE_CALLS"
echo "fake vally progress"
prev=""
skill_dir=""
for arg in "$@"; do
  if [[ "$prev" == "--skill-dir" ]]; then skill_dir="$arg"; fi
  prev="$arg"
done
if [[ -n "$skill_dir" ]]; then
  found=""
  for entry in "$skill_dir"/*; do
    if [[ -d "$entry" ]] && ! [[ -L "$entry" ]] && [[ -f "$entry/SKILL.md" ]]; then
      found="$found$(basename "$entry"),"
    fi
  done
  echo "discovered $skill_dir -> $found" >> "$FAKE_CALLS.discovery"
fi
if [[ "$1" == "compare" ]]; then
  output=""
  while [[ $# -gt 0 ]]; do
    if [[ "$1" == "--output" ]]; then output="$2"; shift 2; else shift; fi
  done
  printf '%s\n' '{"summary":{"wins":1,"ties":0,"losses":0,"trialCount":1,"erroredCount":0},"stimuli":[]}' > "$output"
  exit 0
fi
output_dir=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--output-dir" ]]; then output_dir="$2"; shift 2; else shift; fi
done
mkdir -p "$output_dir/run"
mkdir -p "$output_dir/000-decoy"
printf '%s\n' '{"type":"span"}' > "$output_dir/000-decoy/otel-spans.jsonl"
printf '%s\n' '{"type":"trial-result","status":"success","stimulus":"Missing refined story blocks orchestration","gradeResult":{"passed":true,"score":1}}' '{"type":"run-summary","passed":true}' > "$output_dir/run/results.jsonl"
`)
  chmodSync(fakeVally, 0o755)
})

after(() => rmSync(workspace, { recursive: true, force: true }))

describe('unified Vally runner', () => {
  it('runs an agent suite through the custom executor from the same entry point used for skills', () => {
    const output = execFileSync('bash', [join(repoRoot, 'eng/run-vally-evals.sh'), 'agents', 'agent-behavior'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        COPILOT_GITHUB_TOKEN: 'test-token',
        // The skip list is a live-cost decision; these tests exercise runner
        // mechanics against a fake Vally and must not follow it.
        SKIP_EVALS: '',
        VALLY: fakeVally,
        FAKE_CALLS: callsPath,
        RESULTS_DIR: resultsPath,
        LIVE_LOGS: '1',
      },
    })

    strictEqual(output.includes('fake vally progress'), true)
    strictEqual(readFileSync(join(resultsPath, 'agent-behavior/eval.log'), 'utf8').includes('fake vally progress'), true)

    const calls = readFileSync(callsPath, 'utf8').trim().split(/\r?\n/)
    strictEqual(calls.length, 1)
    strictEqual(calls[0].includes(`--eval-spec ${join(repoRoot, 'tests/agents/agent-behavior/eval.yaml')}`), true)
    strictEqual(calls[0].includes(`--skill-dir ${join(repoRoot, 'plugins/skraft-framework/skills')}`), true)
    strictEqual(calls[0].includes(`--executor-plugin ${join(repoRoot, 'eng/vally-agent-executor/plugin.mjs')}`), true)
    strictEqual(calls[0].includes('--model'), false)
    strictEqual(calls[0].includes('--runs'), false)
    strictEqual(calls[0].includes('--grader-plugin'), false)
  })

  it('turns an agent suite into the same publishable results.json a skill produces', () => {
    writeFileSync(callsPath, '')
    execFileSync('bash', [join(repoRoot, 'eng/run-vally-evals.sh'), 'agents', 'agent-behavior'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        COPILOT_GITHUB_TOKEN: 'test-token',
        // The skip list is a live-cost decision; these tests exercise runner
        // mechanics against a fake Vally and must not follow it.
        SKIP_EVALS: '',
        VALLY: fakeVally,
        FAKE_CALLS: callsPath,
        RESULTS_DIR: resultsPath,
        LIVE_LOGS: '0',
      },
    })

    const published = JSON.parse(readFileSync(join(resultsPath, 'agent-behavior/results.json'), 'utf8'))
    const [verdict] = published.verdicts
    strictEqual(verdict.subject.kind, 'agent')
    strictEqual(verdict.subject.name, 'skraft-orchestrator')
    strictEqual(verdict.passed, true)
  })

  it('leaves the trial budget to the eval spec unless RUNS is set explicitly', () => {
    writeFileSync(callsPath, '')
    execFileSync('bash', [join(repoRoot, 'eng/run-vally-evals.sh'), 'outside-in-tdd'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        COPILOT_GITHUB_TOKEN: 'test-token',
        // The skip list is a live-cost decision; these tests exercise runner
        // mechanics against a fake Vally and must not follow it.
        SKIP_EVALS: '',
        VALLY: fakeVally,
        FAKE_CALLS: callsPath,
        RESULTS_DIR: resultsPath,
        LIVE_LOGS: '0',
        WORKERS: '1',
        PARALLEL: '1',
      },
    })

    const evalCalls = readFileSync(callsPath, 'utf8')
      .trim()
      .split(/\r?\n/)
      .filter((call) => call.startsWith('eval '))
    strictEqual(evalCalls.length > 0, true)
    strictEqual(
      evalCalls.every((call) => !call.includes('--runs')),
      true,
    )
  })

  it('loads declared companion skills through a scoped skilled arm skill directory', () => {
    writeFileSync(callsPath, '')
    writeFileSync(discoveryPath, '')
    execFileSync('bash', [join(repoRoot, 'eng/run-vally-evals.sh'), 'outside-in-tdd'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        COPILOT_GITHUB_TOKEN: 'test-token',
        // The skip list is a live-cost decision; these tests exercise runner
        // mechanics against a fake Vally and must not follow it.
        SKIP_EVALS: '',
        VALLY: fakeVally,
        FAKE_CALLS: callsPath,
        RESULTS_DIR: resultsPath,
        LIVE_LOGS: '0',
        RUNS: '1',
        WORKERS: '1',
        PARALLEL: '1',
      },
    })

    const evalCalls = readFileSync(callsPath, 'utf8')
      .trim()
      .split(/\r?\n/)
      .filter((call) => call.startsWith('eval '))
    strictEqual(evalCalls.length, 2)
    strictEqual(
      evalCalls.some((call) => call.includes('vally-empty-skills-')),
      true,
    )
    strictEqual(
      evalCalls.some((call) => call.includes('vally-scoped-skills-')),
      true,
    )

    // The skill under test and every companion it declares must be reachable
    // inside that scoped directory. A treatment arm that discovers nothing
    // scores as a skill that changed nothing, which reads as a flat or
    // regressed skill rather than as a broken measurement.
    const declared = readFileSync(join(repoRoot, 'tests/skills/outside-in-tdd/eval.skill-dir.yaml'), 'utf8')
      .split(/\r?\n/)
      .map((line) => /^\s*-\s*([A-Za-z0-9-]+)\s*$/.exec(line)?.[1])
      .filter((name) => name && existsSync(join(repoRoot, 'plugins/skraft-framework/skills', name)))

    const scopedArm = readFileSync(discoveryPath, 'utf8')
      .trim()
      .split(/\r?\n/)
      .filter((line) => line.includes('vally-scoped-skills-'))
    strictEqual(scopedArm.length, 1)

    // An arm that discovers nothing logs an empty right-hand side, so read it
    // defensively: the assertion below should name the missing skill rather
    // than die while parsing the evidence of the failure.
    const discovered = (scopedArm[0].split('->')[1] ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
    for (const name of ['outside-in-tdd', ...declared]) {
      strictEqual(discovered.includes(name), true, `${name} is not discoverable in the scoped skilled arm`)
    }
  })

  it('narrows a run to the named stimuli without touching the committed spec', () => {
    writeFileSync(callsPath, '')
    const committedSpec = join(repoRoot, 'tests/skills/outside-in-tdd/eval.yaml')
    const before = readFileSync(committedSpec, 'utf8')
    // Read the two names out of the spec rather than hardcoding them. Naming a
    // stimulus here would make this test a second, undeclared owner of the
    // eval's contents — it would go red the next time the portfolio is
    // rebalanced, which is a change to the instrument and no business of the
    // runner's. What is under test is that the selector narrows and that the
    // committed file is left alone, neither of which depends on the wording.
    const [selected, excluded] = [...before.matchAll(/^ {2}- name: (.+)$/gm)].map((match) => match[1].trim())

    execFileSync('bash', [join(repoRoot, 'eng/run-vally-evals.sh'), 'outside-in-tdd'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        COPILOT_GITHUB_TOKEN: 'test-token',
        // The skip list is a live-cost decision; these tests exercise runner
        // mechanics against a fake Vally and must not follow it.
        SKIP_EVALS: '',
        VALLY: fakeVally,
        FAKE_CALLS: callsPath,
        RESULTS_DIR: resultsPath,
        LIVE_LOGS: '0',
        WORKERS: '1',
        PARALLEL: '1',
        STIMULI: selected,
        PILOT_RUNS: '5',
      },
    })

    // Both arms run the generated pilot, never the committed instrument. The
    // pilot executes from the eval's own directory: vally resolves fixture
    // `src:` paths relative to the spec file, so a pilot run from the results
    // tree could not stage any fixture.
    const evalCalls = readFileSync(callsPath, 'utf8')
      .trim()
      .split(/\r?\n/)
      .filter((call) => call.startsWith('eval '))
    strictEqual(evalCalls.length, 2)
    strictEqual(
      evalCalls.every((call) => call.includes(join(dirname(committedSpec), '.pilot.eval.yaml'))),
      true,
    )
    strictEqual(
      evalCalls.some((call) => call.includes(committedSpec)),
      false,
    )

    const pilot = readFileSync(join(resultsPath, 'outside-in-tdd/pilot.eval.yaml'), 'utf8')
    strictEqual(pilot.includes(selected), true)
    strictEqual(pilot.includes(excluded), false)
    strictEqual(pilot.includes('runs: 5'), true)
    strictEqual(readFileSync(committedSpec, 'utf8'), before)
  })

  it('refuses a pilot selector that matches nothing instead of paying for an arm', () => {
    writeFileSync(callsPath, '')
    let failed = false
    try {
      execFileSync('bash', [join(repoRoot, 'eng/run-vally-evals.sh'), 'outside-in-tdd'], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          COPILOT_GITHUB_TOKEN: 'test-token',
          // The skip list is a live-cost decision; these tests exercise runner
          // mechanics against a fake Vally and must not follow it.
          SKIP_EVALS: '',
          VALLY: fakeVally,
          FAKE_CALLS: callsPath,
          RESULTS_DIR: resultsPath,
          LIVE_LOGS: '0',
          WORKERS: '1',
          PARALLEL: '1',
          STIMULI: 'no such scenario',
        },
      })
    } catch {
      failed = true
    }

    strictEqual(failed, true)
    strictEqual(readFileSync(callsPath, 'utf8').trim(), '')
  })

  it('compares skill runs from results.jsonl instead of nested telemetry streams', () => {
    writeFileSync(callsPath, '')
    const output = execFileSync('bash', [join(repoRoot, 'eng/run-vally-evals.sh'), 'outside-in-tdd'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        COPILOT_GITHUB_TOKEN: 'test-token',
        // The skip list is a live-cost decision; these tests exercise runner
        // mechanics against a fake Vally and must not follow it.
        SKIP_EVALS: '',
        VALLY: fakeVally,
        FAKE_CALLS: callsPath,
        RESULTS_DIR: resultsPath,
        LIVE_LOGS: '0',
        RUNS: '1',
        WORKERS: '1',
        PARALLEL: '1',
      },
    })

    strictEqual(output.includes('outside-in-tdd (no improvement)'), true)
    strictEqual(existsSync(join(resultsPath, 'outside-in-tdd/results.json')), true)

    const calls = readFileSync(callsPath, 'utf8').trim().split(/\r?\n/)
    const compare = calls.find((call) => call.startsWith('compare '))
    strictEqual(Boolean(compare), true)
    strictEqual(compare.includes('otel-spans.jsonl'), false)
    strictEqual(compare.includes(`--eval-spec ${join(repoRoot, 'tests/skills/outside-in-tdd/eval.yaml')}`), true)
    strictEqual(
      calls.some((call) => call.startsWith('eval ') && call.includes('--runs 1')),
      true,
    )
    strictEqual(readFileSync(join(resultsPath, 'outside-in-tdd/eval.log'), 'utf8').includes('missing baseline or skilled records'), false)
  })
})
