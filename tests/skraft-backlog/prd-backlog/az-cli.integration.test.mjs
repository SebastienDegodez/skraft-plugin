// The `az` runner under Windows starts the Python that az.cmd wraps, never cmd.exe.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

import { azCli } from '../../../plugins/skraft-backlog/prd-backlog/publish-azure.mjs'

test('under Windows, az runs as <CLI2>\\python.exe -IBm azure.cli with its arguments untouched', { skip: process.platform === 'win32' && 'a script stands in for python.exe' }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'az cli '))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'wbin'))
  await writeFile(join(root, 'wbin', 'az.cmd'), '@"%~dp0..\\python.exe" -IBm azure.cli %*\r\n')
  const python = join(root, 'python.exe')
  await writeFile(python, '#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)))\n')
  await chmod(python, 0o755)
  const run = azCli(root, { platform: 'win32', path: ['/nowhere', join(root, 'wbin')].join(delimiter) })
  const answer = await run(['boards', 'work-item', 'create', '--description', '<p>a "quoted" & piped | text</p>'])
  assert.equal(answer.status, 0, answer.stderr)
  assert.deepEqual(JSON.parse(answer.stdout), ['-IBm', 'azure.cli', 'boards', 'work-item', 'create', '--description', '<p>a "quoted" & piped | text</p>'])
})

test('under Windows without az on the PATH, the runner answers a fixed failure', async () => {
  const answer = await azCli(undefined, { platform: 'win32', path: '/nowhere' })(['--version'])
  assert.deepEqual(answer, { status: 1, stdout: '', stderr: 'az.cmd and its python.exe were not found on the PATH' })
})
