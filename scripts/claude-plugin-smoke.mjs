#!/usr/bin/env node
// Real Claude plugin loading and guard receipts; never infer success from model prose.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const plugin = fileURLToPath(new URL('../plugins/skraft-framework/', import.meta.url))
const root = mkdtempSync(join(tmpdir(), 'skraft claude smoke '))
const workspace = join(root, 'workspace')
const home = join(root, 'config')
const useUserAuth = process.argv.includes('--use-user-auth')
mkdirSync(workspace)
mkdirSync(home)
console.log(`Evidence: ${root}`)
const version = spawnSync('claude', ['--version'], { encoding: 'utf8', timeout: 15_000 })
if (version.status !== 0) throw new Error(version.stderr || 'Claude unavailable')
console.log(version.stdout.trim())
const forbidden = '.copilot-tracking/skraft-plans/smoke/state.json'
// Ensure a failed shell redirection cannot masquerade as hook enforcement.
mkdirSync(join(workspace, '.copilot-tracking/skraft-plans/smoke'), { recursive: true })
const results = []
for (const [name, command] of [
  ['allowed', 'echo skraft-claude-smoke'],
  ['denied', `echo "{}" > ${forbidden}`],
]) {
  const auditPath = join(root, `${name}-audit.jsonl`)
  const run = spawnSync('claude', [
    '-p', `Use Bash once to run exactly: ${command}. If refused, report the refusal and stop. Do not use any other tool or retry.`,
    '--plugin-dir', plugin, '--setting-sources', '', '--strict-mcp-config',
    '--mcp-config', '{"mcpServers":{}}', '--no-session-persistence',
    '--allowedTools', `Bash(${command})`, '--max-turns', '3',
    '--output-format', 'stream-json', '--verbose', '--include-hook-events',
    '--debug-file', join(root, `${name}-debug.log`),
  ], {
    cwd: workspace, encoding: 'utf8', timeout: 180_000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, ...(useUserAuth ? {} : { CLAUDE_CONFIG_DIR: home }), SKRAFT_AUDIT_LOG: auditPath },
  })
  writeFileSync(join(root, `${name}-stream.jsonl`), run.stdout ?? '')
  writeFileSync(join(root, `${name}-stderr.txt`), run.stderr ?? '')
  const events = (run.stdout ?? '').split('\n').filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)] } catch { return [] }
  })
  const init = events.find((event) => event.type === 'system' && event.subtype === 'init')
  const audit = existsSync(auditPath) ? readFileSync(auditPath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : []
  const outcome = events.findLast((event) => event.type === 'result')
  const toolCalls = events.flatMap((event) => event.message?.content ?? [])
    .filter((block) => block.type === 'tool_use' && block.name === 'Bash')
  const errors = []
  if (run.error || run.status !== 0 || outcome?.is_error) errors.push(run.error?.message ?? outcome?.result ?? `exit ${run.status}`)
  if (!init) errors.push('No initialization event')
  if (!toolCalls.some((call) => call.input?.command === command)) errors.push('Exact Bash command not attempted')
  if (!audit.length) errors.push('No hook audit receipt')
  if (name === 'denied' && !audit.some((entry) => entry.decision === 'DENY')) errors.push('No DENY receipt')
  if (existsSync(join(workspace, forbidden))) errors.push('Forbidden write landed')
  const result = { name, agents: init?.agents, plugins: init?.plugins, skills: init?.skills,
    audit, errors, status: errors.length ? 'FAIL' : 'PASS' }
  results.push(result)
  console.log(JSON.stringify(result, null, 2))
  if (errors.length) break
}
writeFileSync(join(root, 'results.json'), JSON.stringify({ version: version.stdout.trim(), results }, null, 2))
process.exitCode = results.length === 2 && results.every((r) => r.status === 'PASS') ? 0 : 1