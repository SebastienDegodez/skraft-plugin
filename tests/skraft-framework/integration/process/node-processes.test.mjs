import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { createNodeCommandRunner, createNodeExecutables } from '../../../../plugins/skraft-framework/engine/infrastructure/process/node-processes.mjs'
import { envWithPath, tempFolder, toolFolders } from '../support/workspace.mjs'

const ECHO_ARGS = 'process.stdout.write(JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(1) }))'

test('a command runs from its folder, relative to the working copy, with its arguments untouched by any shell', async (t) => {
  const root = tempFolder(t)
  mkdirSync(join(root, 'work', 'api'), { recursive: true })
  mkdirSync(join(root, 'payment web'), { recursive: true })
  const runner = createNodeCommandRunner({ root: join(root, 'work') })

  const nested = await runner.run({ argv: ['node', '-e', ECHO_ARGS, 'a b', '$HOME', '"quoted"', 'x&y|z', '%PATH%'], cwd: 'api' })
  const neighbour = await runner.run({ argv: ['node', '-e', ECHO_ARGS], cwd: '../payment web' })

  assert.deepEqual([nested.started, nested.exitCode, nested.stderr], [true, 0, ''])
  assert.deepEqual(JSON.parse(nested.stdout).args, ['a b', '$HOME', '"quoted"', 'x&y|z', '%PATH%'])
  assert.equal(JSON.parse(nested.stdout).cwd.toLowerCase(), join(root, 'work', 'api').toLowerCase())
  assert.equal(JSON.parse(neighbour.stdout).cwd.toLowerCase(), join(root, 'payment web').toLowerCase())
})

test('the exit code and both outputs come back; a missing program or folder is not started', async (t) => {
  const root = tempFolder(t)
  const runner = createNodeCommandRunner({ root })

  const failed = await runner.run({ argv: ['node', '-e', 'console.log("out"); console.error("err"); process.exit(3)'], cwd: '.' })
  const missing = await runner.run({ argv: ['skraft-no-such-program', '--version'], cwd: '.' })
  const noFolder = await runner.run({ argv: ['node', '--version'], cwd: 'gone' })

  assert.deepEqual([failed.started, failed.exitCode, failed.stdout.trim(), failed.stderr.trim()], [true, 3, 'out', 'err'])
  assert.deepEqual(missing, { started: false, exitCode: null, stdout: '', stderr: '', error: 'command not found: skraft-no-such-program' })
  assert.deepEqual([noFolder.started, noFolder.error], [false, `folder not found: ${join(root, 'gone')}`])
})

test('a program on the PATH, a .cmd shim under Windows included, runs with its arguments intact', async (t) => {
  const root = tempFolder(t)
  const bin = join(root, 'bin with space')
  mkdirSync(bin)
  const script = join(root, 'echo-args.mjs')
  writeFileSync(script, `${ECHO_ARGS.replace('slice(1)', 'slice(2)')}\n`)
  if (process.platform === 'win32') {
    writeFileSync(join(bin, 'tool.cmd'), `@"${process.execPath}" "${script}" %*\r\n`)
  } else {
    writeFileSync(join(bin, 'tool'), `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`)
    chmodSync(join(bin, 'tool'), 0o755)
  }
  const env = envWithPath([bin, ...toolFolders()])
  const runner = createNodeCommandRunner({ root, env })

  const result = await runner.run({ argv: ['tool', 'plain', 'with space', 'a&b', '50%', '--since:abc123'], cwd: '.' })

  assert.equal(result.started, true, result.error)
  assert.equal(result.exitCode, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout).args, ['plain', 'with space', 'a&b', '50%', '--since:abc123'])
  assert.equal(await createNodeExecutables({ root, env }).locate('tool', '.'), join(bin, process.platform === 'win32' ? 'tool.cmd' : 'tool'))
})

test('locate finds a program on the PATH or at a path from the folder, and nothing else', async (t) => {
  const root = tempFolder(t)
  mkdirSync(join(root, 'web'))
  const local = join(root, 'web', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')
  writeFileSync(local, process.platform === 'win32' ? '@exit /b 0\r\n' : '#!/bin/sh\nexit 0\n')
  if (process.platform !== 'win32') chmodSync(local, 0o755)
  const executables = createNodeExecutables({ root })

  assert.equal((await executables.locate('node', 'web'))?.toLowerCase().startsWith(process.platform === 'win32' ? '' : '/'), true)
  assert.equal(await executables.locate('./gradlew', 'web'), local)
  assert.equal(await executables.locate('./gradlew', '.'), null)
  assert.equal(await executables.locate('skraft-no-such-program', '.'), null)
  assert.equal(await executables.locate('', '.'), null)
})

test('under POSIX a file that is not executable is not a program', { skip: process.platform === 'win32' }, async (t) => {
  const root = tempFolder(t)
  writeFileSync(join(root, 'notes'), 'text\n')
  chmodSync(join(root, 'notes'), 0o644)

  assert.equal(await createNodeExecutables({ root }).locate('./notes', '.'), null)
  assert.deepEqual((await createNodeCommandRunner({ root }).run({ argv: ['./notes'], cwd: '.' })).started, false)
})

test('under Windows rules a program is found by PATHEXT, in Path whatever its case, unless it already has one of those extensions', async (t) => {
  const root = tempFolder(t)
  const bin = join(root, 'bin')
  mkdirSync(bin)
  for (const name of ['npm.cmd', 'dotnet.exe', 'python3.12.exe', 'tool.bat']) writeFileSync(join(bin, name), '')
  const env = { Path: bin, PATHEXT: '.exe;.cmd;.bat' }
  const windows = createNodeExecutables({ root, platform: 'win32', env })

  assert.equal(await windows.locate('npm', '.'), join(bin, 'npm.cmd'))
  assert.equal(await windows.locate('dotnet', '.'), join(bin, 'dotnet.exe'))
  assert.equal(await windows.locate('python3.12', '.'), join(bin, 'python3.12.exe'))
  assert.equal(await windows.locate('tool.bat', '.'), join(bin, 'tool.bat'))
  assert.equal(await windows.locate('npm', '.'), await createNodeExecutables({ root, platform: 'win32', env: { PATH: bin, PATHEXT: '.cmd' } }).locate('npm', '.'))
  assert.equal(await windows.locate('git', '.'), null)
})

// cmd.exe stands for itself here: a script that prints the command line it receives.
test('a .cmd starts through ComSpec with /d /s /c and every argument quoted and escaped for cmd', { skip: process.platform === 'win32' }, async (t) => {
  const root = tempFolder(t)
  const bin = join(root, 'bin')
  mkdirSync(join(bin, 'node_modules', '.bin'), { recursive: true })
  writeFileSync(join(bin, 'npm.cmd'), '')
  writeFileSync(join(bin, 'node_modules', '.bin', 'vitest.cmd'), '')
  const comspec = join(root, 'cmd.exe')
  writeFileSync(comspec, `#!${process.execPath}\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)))\n`)
  chmodSync(comspec, 0o755)
  const runner = createNodeCommandRunner({ root, platform: 'win32', env: { Path: bin, PATHEXT: '.cmd', ComSpec: comspec } })

  const npm = await runner.run({ argv: ['npm', 'run', 'test:unit', 'a b', 'x&y', '50%', 'say "hi"'], cwd: '.' })
  const shim = await runner.run({ argv: ['node_modules/.bin/vitest', 'a&b'], cwd: 'bin' })

  assert.deepEqual(JSON.parse(npm.stdout), ['/d', '/s', '/c', `"${join(bin, 'npm.cmd')} ^"run^" ^"test:unit^" ^"a^ b^" ^"x^&y^" ^"50^%^" ^"say^ \\^"hi\\^"^""`])
  assert.deepEqual(JSON.parse(shim.stdout), ['/d', '/s', '/c', `"${join(bin, 'node_modules', '.bin', 'vitest.cmd')} ^^^"a^^^&b^^^""`])
})
