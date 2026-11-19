import { strictEqual, match } from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

let workspace
let repo
let fakeVally

const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()

// The fake Vally reports the token count written in `arm-tokens` at the root of
// the worktree it was launched from, so each ref yields its own arm.
const fakeVallyScript = `#!/usr/bin/env bash
set -euo pipefail
spec=""; output_dir=""; prev=""
for arg in "$@"; do
  [[ "$prev" == "--eval-spec" ]] && spec="$arg"
  [[ "$prev" == "--output-dir" ]] && output_dir="$arg"
  prev="$arg"
done
tree="$(cd "$(dirname "$spec")/../../.." && pwd)"
tokens="$(cat "$tree/arm-tokens")"
score="$(cat "$tree/arm-score")"
mkdir -p "$output_dir/run"
printf '{"type":"trial-result","status":"success","stimulus":"story","durationMs":%s,"gradeResult":{"passed":true,"score":%s},"trajectory":{"events":[],"metrics":{"tokenUsage":{"totalTokens":%s},"turnCount":2,"toolCallCount":0}}}\\n' "$tokens" "$score" "$tokens" > "$output_dir/run/results.jsonl"
`

const commitArm = (branch, tokens, score) => {
  git('checkout', '--quiet', '-B', branch, 'base')
  writeFileSync(join(repo, 'arm-tokens'), String(tokens))
  writeFileSync(join(repo, 'arm-score'), String(score))
  git('add', 'arm-tokens', 'arm-score')
  git('commit', '--quiet', '-m', `arm ${branch}`)
}

const bench = (control, candidate) =>
  spawnSync('bash', [join(repo, 'eng/bench-agent-ab.sh'), 'demo-suite', control, candidate], {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      COPILOT_GITHUB_TOKEN: 'test-token',
      SKIP_EVALS: '',
      VALLY: fakeVally,
      BENCH_DIR: join(workspace, 'bench'),
    },
  })

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'bench-ab-'))
  repo = join(workspace, 'repo')
  mkdirSync(repo)
  cpSync(join(repoRoot, 'eng'), join(repo, 'eng'), { recursive: true })
  cpSync(join(repoRoot, 'plugins/skraft-framework/skills'), join(repo, 'plugins/skraft-framework/skills'), { recursive: true })
  mkdirSync(join(repo, 'tests/agents/demo-suite'), { recursive: true })
  writeFileSync(join(repo, 'tests/agents/demo-suite/eval.yaml'), 'name: demo-suite\nstimuli: []\n')
  // The runner resolves eval models through the installed Vally; each worktree links this install.
  if (existsSync(join(repoRoot, 'node_modules'))) symlinkSync(join(repoRoot, 'node_modules'), join(repo, 'node_modules'))
  writeFileSync(join(repo, '.gitignore'), 'node_modules\n')
  execFileSync('git', ['init', '--quiet', '-b', 'base'], { cwd: repo })
  git('config', 'user.email', 'bench@example.invalid')
  git('config', 'user.name', 'Bench')
  git('add', '.')
  git('commit', '--quiet', '-m', 'base')
  commitArm('control', 2000, 1)
  commitArm('faster', 1000, 1)
  commitArm('worse', 500, 0.5)
  git('checkout', '--quiet', 'base')
  fakeVally = join(workspace, 'vally')
  writeFileSync(fakeVally, fakeVallyScript)
  chmodSync(fakeVally, 0o755)
})

after(() => rmSync(workspace, { recursive: true, force: true }))

describe('A/B agent benchmark', () => {
  it('runs the same suite at two refs and reports the candidate cheaper', () => {
    const result = bench('control', 'faster')

    strictEqual(result.status, 0, result.stderr)
    match(result.stdout, /Verdict : improved/)
    match(result.stdout, /\| Tokens \| 2000 \| 1000 \| -50 % \|/)
  })

  it('removes both worktrees and keeps the comparison', () => {
    const runs = join(workspace, 'bench/demo-suite')
    const latest = readdirSync(runs).sort().at(-1)

    strictEqual(existsSync(join(runs, latest, 'control/worktree')), false)
    strictEqual(existsSync(join(runs, latest, 'comparison.json')), true)
    strictEqual(readFileSync(join(runs, latest, 'candidate/ref'), 'utf8').trim(), 'faster')
  })

  it('exits 3 when the candidate loses quality', () => {
    const result = bench('control', 'worse')

    strictEqual(result.status, 3, result.stderr)
    match(result.stdout, /Verdict : quality-regression/)
  })
})
