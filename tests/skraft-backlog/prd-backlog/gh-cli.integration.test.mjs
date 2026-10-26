// The `gh` runner of the publisher, on real processes: an argv array, never a shell; bounded in
// time, by a signal and in output; ended with every process it started; never a throw.
// `program` stands in for gh: Node runs a script that behaves like the case under test.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ghCli } from '../../../plugins/skraft-backlog/prd-backlog/publish.mjs'

const NODE = process.execPath
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const tempDir = async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-gh-cli-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}

/** A script that starts a grandchild writing `marker` after 1.5 s, then waits forever. @param {string} marker */
const familyScript = (marker) => `
  const { spawn } = require('node:child_process')
  spawn(process.execPath, ['-e', ${JSON.stringify(`setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'alive'), 1500)`)}], { stdio: 'ignore' })
  setInterval(() => {}, 1000)
`

test('gh runs from the directory it is given, with an argv array and its input on stdin', async (t) => {
  const dir = await tempDir(t)
  const gh = ghCli(dir, { program: NODE })

  const result = await gh(['-e', 'process.stdin.pipe(process.stdout); console.error(process.cwd())', 'an argument; with $(shell) characters'], '{"title":"x"}')

  assert.deepEqual([result.status, result.stdout], [0, '{"title":"x"}'])
  assert.equal(await realpath(result.stderr.trim()), await realpath(dir))
})

test('a gh that runs past its time limit is ended with every process it started', async (t) => {
  const dir = await tempDir(t)
  const marker = join(dir, 'grandchild-alive')
  const gh = ghCli(dir, { program: NODE, timeoutMs: 300 })

  const started = Date.now()
  const result = await gh(['-e', familyScript(marker)])

  assert.ok(Date.now() - started < 1400, 'it does not wait for the grandchild')
  assert.deepEqual(result, { status: 1, stdout: '', stderr: 'gh did not finish within 0.3 s' })
  await sleep(1800)
  assert.equal(existsSync(marker), false, 'the grandchild was ended with it')
})

test('a gh cancelled by its signal stops; one that writes past the output limit is ended', async (t) => {
  const dir = await tempDir(t)
  const controller = new AbortController()
  setTimeout(() => controller.abort(), 100)
  const cancelled = await ghCli(dir, { program: NODE, signal: controller.signal })(['-e', 'setInterval(() => {}, 1000)'])
  assert.deepEqual(cancelled, { status: 1, stdout: '', stderr: 'gh was cancelled' })

  const flood = await ghCli(dir, { program: NODE, maxOutputBytes: 1024 })(['-e', 'setInterval(() => process.stdout.write("x".repeat(4096)), 5)'])
  assert.deepEqual(flood, { status: 1, stdout: '', stderr: 'gh wrote more than 1024 bytes' })
})

test('a gh that cannot start answers a failure said by its code, and never throws', async (t) => {
  const dir = await tempDir(t)
  const result = await ghCli(dir, { program: join(dir, 'no-such-gh') })(['api', 'repos/acme/permis'])
  assert.deepEqual(result, { status: 1, stdout: '', stderr: 'gh could not be started (ENOENT)' })
})
