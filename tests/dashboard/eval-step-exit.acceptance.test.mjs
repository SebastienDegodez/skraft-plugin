import { strictEqual } from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'))
const workflow = readFileSync(join(repoRoot, '.github/workflows/skill-evaluation.yml'), 'utf8')

// The `run: |` block of the per-subject evaluation step, dedented.
function evaluationScript() {
  const lines = workflow.split('\n')
  const step = lines.findIndex((line) => line.includes('- name: Run the ${{ matrix.kind }} evaluation'))
  strictEqual(step >= 0, true, 'evaluation step not found')
  const run = lines.findIndex((line, index) => index > step && /^\s+run: \|\s*$/.test(line))
  const indent = lines[run + 1].match(/^\s*/)[0]
  const body = []
  for (const line of lines.slice(run + 1)) {
    if (line.trim() && !line.startsWith(indent)) break
    body.push(line.slice(indent.length))
  }
  return body.join('\n')
}

// GitHub runs a `run:` step with `bash --noprofile --norc -eo pipefail {0}`. Under
// `-e` a failing runner ends the step on the spot, so a status read on the next
// line never runs: the advisory branch for agent suites must survive that shell.
function runStep({ kind, runnerExit }) {
  const workspace = mkdtempSync(join(tmpdir(), 'eval-step-'))
  try {
    mkdirSync(join(workspace, 'eng'))
    const runner = join(workspace, 'eng/run-vally-evals.sh')
    writeFileSync(runner, `#!/usr/bin/env bash\nexit ${runnerExit}\n`)
    chmodSync(runner, 0o755)
    const script = join(workspace, 'step.sh')
    writeFileSync(script, evaluationScript())
    return spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', script], {
      cwd: workspace,
      encoding: 'utf8',
      env: { ...process.env, RUNNER_ARGS: `${kind}s probe`, KIND: kind, NAME: 'probe' },
    })
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
}

describe('per-subject evaluation step under the GitHub Actions shell', { skip: process.platform === 'win32' && 'bash step' }, () => {
  it('keeps an agent suite under its threshold advisory', () => {
    const result = runStep({ kind: 'agent', runnerExit: 1 })
    strictEqual(result.status, 0, result.stderr)
    strictEqual(result.stdout.includes('::warning::Agent suite probe did not meet its threshold'), true)
  })

  it('still fails a skill cell whose runner fails', () => {
    strictEqual(runStep({ kind: 'skill', runnerExit: 1 }).status, 1)
  })

  it('passes a cell whose runner passes', () => {
    strictEqual(runStep({ kind: 'agent', runnerExit: 0 }).status, 0)
    strictEqual(runStep({ kind: 'skill', runnerExit: 0 }).status, 0)
  })
})
