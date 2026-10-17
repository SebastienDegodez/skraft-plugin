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

test('the exit code and both outputs come back, a command waiting on input gets none; a missing program or folder is not started', async (t) => {
  const root = tempFolder(t)
  const runner = createNodeCommandRunner({ root })

  const failed = await runner.run({ argv: ['node', '-e', 'console.log("out"); console.error("err"); process.exit(3)'], cwd: '.' })
  const missing = await runner.run({ argv: ['skraft-no-such-program', '--version'], cwd: '.' })
  const noFolder = await runner.run({ argv: ['node', '--version'], cwd: 'gone' })
  const reader = await runner.run({ argv: ['node', '-e', 'process.stdin.resume().on("end", () => process.exit(4))'], cwd: '.' })

  assert.deepEqual([failed.started, failed.exitCode, failed.stdout.trim(), failed.stderr.trim(), 'error' in failed], [true, 3, 'out', 'err', false])
  assert.deepEqual(missing, { started: false, exitCode: null, stdout: '', stderr: '', error: 'command not found: skraft-no-such-program' })
  assert.deepEqual([noFolder.started, noFolder.error], [false, `folder not found: ${join(root, 'gone')}`])
  assert.equal(reader.exitCode, 4)
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
  assert.equal((await createNodeExecutables({ root, env }).locate('tool', '.'))?.toLowerCase(), join(bin, process.platform === 'win32' ? 'tool.cmd' : 'tool').toLowerCase())
})

test('locate finds a program on the PATH or at a path from the folder, and nothing else', async (t) => {
  const root = tempFolder(t)
  mkdirSync(join(root, 'web'))
  const local = join(root, 'web', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')
  writeFileSync(local, process.platform === 'win32' ? '@exit /b 0\r\n' : '#!/bin/sh\nexit 0\n')
  if (process.platform !== 'win32') chmodSync(local, 0o755)
  const executables = createNodeExecutables({ root })

  assert.match(await executables.locate('node', 'web') ?? '', process.platform === 'win32' ? /\\node\.exe$/i : /\/node$/)
  assert.equal((await executables.locate('./gradlew', 'web'))?.toLowerCase(), local.toLowerCase())
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

test('under POSIX a program stopped by a signal has no exit code and names the signal', { skip: process.platform === 'win32' }, async (t) => {
  const runner = createNodeCommandRunner({ root: tempFolder(t) })

  const killed = await runner.run({ argv: ['node', '-e', 'process.kill(process.pid, "SIGKILL")'], cwd: '.' })

  assert.deepEqual(killed, { started: true, exitCode: null, stdout: '', stderr: '', error: 'node was stopped by SIGKILL' })
})

test('a program found but that the system refuses to start is not started, with the system\'s reason', async (t) => {
  const root = tempFolder(t)
  const broken = join(root, process.platform === 'win32' ? 'broken.exe' : 'broken')
  writeFileSync(broken, process.platform === 'win32' ? 'not a program' : '#!/skraft/no/such/interpreter\n')
  if (process.platform !== 'win32') chmodSync(broken, 0o755)

  const result = await createNodeCommandRunner({ root }).run({ argv: [process.platform === 'win32' ? './broken.exe' : './broken', '--version'], cwd: '.' })

  assert.deepEqual([result.started, result.exitCode], [false, null])
  assert.match(result.error, /^\.\/broken(\.exe)? could not be started: spawn /)
})

test('under Windows rules a program is found by PATHEXT, in Path whatever its case, unless it already has one of those extensions', async (t) => {
  const root = tempFolder(t)
  const bin = join(root, 'bin')
  mkdirSync(bin)
  for (const name of ['npm', 'npm.cmd', 'dotnet.exe', 'python3.12.exe', 'tool.bat', 'tsc.CMD']) writeFileSync(join(bin, name), '')
  const env = { Path: bin, PATHEXT: '.exe;.cmd;.bat' }
  const windows = createNodeExecutables({ root, platform: 'win32', env })

  assert.equal(await windows.locate('npm', '.'), join(bin, 'npm.cmd'))
  assert.equal(await windows.locate('dotnet', '.'), join(bin, 'dotnet.exe'))
  assert.equal(await windows.locate('python3.12', '.'), join(bin, 'python3.12.exe'))
  assert.equal(await windows.locate('tool.bat', '.'), join(bin, 'tool.bat'))
  assert.equal(await windows.locate('npm', '.'), await createNodeExecutables({ root, platform: 'win32', env: { PATH: bin, PATHEXT: '.cmd' } }).locate('npm', '.'))
  assert.equal(await windows.locate('git', '.'), null)
  assert.equal(await createNodeExecutables({ root, platform: 'win32', env: { Path: bin, PATHEXT: ';.cmd' } }).locate('npm', '.'), join(bin, 'npm.cmd'))
  assert.equal(await createNodeExecutables({ root, platform: 'win32', env: { Path: bin } }).locate('tsc', '.'), join(bin, 'tsc.CMD'))
})

// cmd.exe stands for itself here: a script that prints the command line it receives.
test('a .cmd starts through ComSpec with /d /s /c and every argument quoted and escaped for cmd', { skip: process.platform === 'win32' }, async (t) => {
  const root = tempFolder(t)
  const bin = join(root, 'Program Files (x86)')
  mkdirSync(join(bin, 'node_modules', '.bin'), { recursive: true })
  for (const name of ['npm.CMD', 'gradlew.BAT', join('node_modules', '.bin', 'vitest.CMD')]) writeFileSync(join(bin, name), '')
  const comspec = join(root, 'cmd.exe')
  writeFileSync(comspec, `#!${process.execPath}\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)))\n`)
  chmodSync(comspec, 0o755)
  const runner = createNodeCommandRunner({ root, platform: 'win32', env: { Path: bin, PATHEXT: '.CMD;.BAT', ComSpec: comspec } })

  const npm = await runner.run({ argv: ['npm', 'run', 'test:unit', 'a b', 'x&y', '50%', 'say "hi"', 'C:\\out\\'], cwd: '.' })
  const shim = await runner.run({ argv: ['node_modules/.bin/vitest', 'a&b'], cwd: 'Program Files (x86)' })
  const gradle = await runner.run({ argv: ['gradlew', 'build', 'C:\\cache\\\\'], cwd: '.' })

  const escaped = join(root, 'Program^ Files^ ^(x86^)')
  assert.deepEqual(JSON.parse(npm.stdout), ['/d', '/s', '/c', `"${join(escaped, 'npm.CMD')} ^"run^" ^"test:unit^" ^"a^ b^" ^"x^&y^" ^"50^%^" ^"say^ \\^"hi\\^"^" ^"C:\\out\\\\^""`])
  assert.deepEqual(JSON.parse(shim.stdout), ['/d', '/s', '/c', `"${join(escaped, 'node_modules', '.bin', 'vitest.CMD')} ^^^"a^^^&b^^^""`])
  assert.deepEqual(JSON.parse(gradle.stdout), ['/d', '/s', '/c', `"${join(escaped, 'gradlew.BAT')} ^"build^" ^"C:\\cache\\\\\\\\^""`])
})

test('under Windows rules without ComSpec, a .cmd goes to cmd.exe, and one that cannot start says so', { skip: process.platform === 'win32' }, async (t) => {
  const root = tempFolder(t)
  writeFileSync(join(root, 'npm.cmd'), '')
  const runner = createNodeCommandRunner({ root, platform: 'win32', env: { Path: root, PATHEXT: '.cmd' } })

  const result = await runner.run({ argv: ['npm', 'test'], cwd: '.' })

  assert.deepEqual([result.started, result.error], [false, 'npm could not be started: spawn cmd.exe ENOENT'])
})
