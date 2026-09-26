// Acceptance — the audit log belongs to the project a hook runs in: its git directory,
// never the shared plugin cache, whatever the hook process's own working directory.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN = fileURLToPath(new URL('../../../plugins/skraft-framework/', import.meta.url))
const STATE_CLI = join(PLUGIN, 'src/cli/state.mjs')

const inProject = (fn) => {
  const project = realpathSync(mkdtempSync(join(tmpdir(), 'skraft-audit-')))
  const env = { ...process.env }
  for (const key of ['SKRAFT_TRACKING_ROOT', 'SKRAFT_AUDIT_LOG', 'SKRAFT_PROJECT_SLUG']) delete env[key]
  try { fn({ project, env }) } finally { rmSync(project, { recursive: true, force: true }) }
}

test('the hooks write the audit log of the project they run in', () => {
  inProject(({ project, env }) => {
    execFileSync('git', ['init', '-q'], { cwd: project })
    mkdirSync(join(project, 'sub'), { recursive: true })
    execFileSync('node', [STATE_CLI, 'init', '--slug', 'pricing'], { cwd: project, env, stdio: 'ignore' })
    execFileSync('node', [join(PLUGIN, 'src/cli/hook.mjs'), 'PreToolUse', 'Agent'], {
      cwd: tmpdir(),
      env,
      input: JSON.stringify({ tool_name: 'Agent', tool_input: { subagent_type: 'solution-researcher' }, cwd: project }),
      encoding: 'utf8',
    })
    const auditLog = join(project, '.git', 'skraft', 'skill-audit.jsonl')
    assert.match(readFileSync(auditLog, 'utf8'), /DispatchEvaluated/)
  })
})
