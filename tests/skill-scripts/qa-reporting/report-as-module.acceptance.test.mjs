import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

// report.mjs is a program first: started, it runs its command; imported by another module (a
// skraft_repl cell, a test), it runs nothing until its exported function is called.
const cli = fileURLToPath(new URL('../../../plugins/skraft-framework/skills/qa-reporting/scripts/report/cli/report.mjs', import.meta.url))

const scratch = (t) => {
  const folder = mkdtempSync(join(tmpdir(), 'skraft report module '))
  t.after(() => rmSync(folder, { recursive: true, force: true }))
  return folder
}

test('importing report.mjs from another module writes nothing and leaves the exit code unset', (t) => {
  const importer = `await import(${JSON.stringify(pathToFileURL(cli).href)}); await new Promise((done) => setTimeout(done, 200)); process.stdout.write('exitCode=' + String(process.exitCode))`
  const imported = spawnSync(process.execPath, ['--input-type=module', '-e', importer], { cwd: scratch(t), encoding: 'utf8' })

  assert.deepEqual([imported.status, imported.stdout, imported.stderr], [0, 'exitCode=undefined', ''])
})

test('runReport answers a command with its exit code and what it would print, without touching the process', async (t) => {
  const { runReport } = await import(pathToFileURL(cli).href)
  const cwd = scratch(t)

  const help = await runReport(['--help'], { cwd, env: {} })
  const unknown = await runReport(['nope'], { cwd, env: {} })

  assert.equal(help.exitCode, 0)
  assert.deepEqual(Object.keys(JSON.parse(help.stdout)), ['commands', 'usage', 'publication', 'abandonment', 'concurrency'])
  assert.equal(help.stderr, '')
  assert.deepEqual([unknown.exitCode, unknown.stdout, JSON.parse(unknown.stderr)], [1, '', { code: 'REPORT_ERROR', reason: 'Unknown command; use --help for usage' }])
  assert.equal(process.exitCode, undefined)
})

test('started as a program, report.mjs still prints its answer and sets its exit code', (t) => {
  const cwd = scratch(t)
  const help = spawnSync(process.execPath, [cli, '--help'], { cwd, encoding: 'utf8' })
  const unknown = spawnSync(process.execPath, [cli, 'nope'], { cwd, encoding: 'utf8' })

  assert.deepEqual([help.status, help.stderr], [0, ''])
  assert.equal(JSON.parse(help.stdout).usage, 'report.mjs <command> --<option> <value>')
  assert.deepEqual([unknown.status, unknown.stdout, JSON.parse(unknown.stderr).reason], [1, '', 'Unknown command; use --help for usage'])
})
