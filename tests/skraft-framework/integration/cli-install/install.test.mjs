import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCli, USAGE } from '../../../../plugins/skraft-framework/engine/drivers/cli/run-cli.mjs'
import { windowsUserPathWriter } from '../../../../plugins/skraft-framework/engine/drivers/cli/install-host.mjs'

const pluginRoot = new URL('../../../../plugins/skraft-framework/', import.meta.url)
const realCli = fileURLToPath(new URL('engine/drivers/cli/skraft.mjs', pluginRoot))
const launcherSource = fileURLToPath(new URL('engine/drivers/cli/launcher.mjs', pluginRoot))
const pluginVersion = JSON.parse(readFileSync(new URL('plugin.json', pluginRoot), 'utf8')).version
const posixOnly = { skip: process.platform === 'win32' && 'the sh shim is tested on POSIX' }
const windowsOnly = { skip: process.platform !== 'win32' && 'the cmd shim is tested on Windows' }

const temporaryHome = () => mkdtempSync(join(tmpdir(), 'skraft-install-'))
const binOf = (home) => join(home, '.skraft', 'bin')

const hostOf = (home, overrides = {}) => {
  const writes = []
  const host = {
    home, env: { PATH: '/usr/bin', SHELL: '/bin/zsh' }, platform: 'linux', skraftPath: realCli, launcherSource,
    setWindowsUserPath: (folder) => { writes.push(folder); return true },
    ...overrides,
  }
  return { host, writes }
}

const run = async (args, host) => {
  const lines = { out: [], err: [] }
  const console = { out: (line) => lines.out.push(line), err: (line) => lines.err.push(line) }
  const code = await runCli(args, { pluginVersion: () => '0.0.0', installHost: () => host }, console)
  return { code, ...lines }
}

const withHome = async (body) => {
  const home = temporaryHome()
  try { await body(home) } finally { rmSync(home, { recursive: true, force: true }) }
}

const spawnWith = (home, command, args) => spawnSync(command, args, {
  encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home },
})

const fakePlugin = (root, marker) => {
  const cli = join(root, 'engine', 'drivers', 'cli', 'skraft.mjs')
  mkdirSync(join(root, 'engine', 'drivers', 'cli'), { recursive: true })
  writeFileSync(cli, `console.log(${JSON.stringify(marker)})\n`)
  return cli
}

const listInstalled = (home, installPath) => {
  mkdirSync(join(home, '.claude', 'plugins'), { recursive: true })
  const plugins = { 'other@market': [{ installPath: '/elsewhere' }], 'skraft@market': [{ installPath }] }
  writeFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins }))
}

test('install writes the launcher, both calls and the target of a plugin outside the Claude Code cache', async () => {
  await withHome(async (home) => {
    const { host } = hostOf(home)
    const { code } = await run(['install', '--no-path'], host)
    const bin = binOf(home)

    assert.equal(code, 0)
    assert.equal(readFileSync(join(bin, 'skraft-launcher.mjs'), 'utf8'), readFileSync(launcherSource, 'utf8'))
    assert.match(readFileSync(join(bin, 'skraft'), 'utf8'), /^#!\/bin\/sh\nexec node ".*skraft-launcher\.mjs" "\$@"\n$/)
    if (process.platform !== 'win32') assert.equal(statSync(join(bin, 'skraft')).mode & 0o777, 0o755)
    assert.equal(readFileSync(join(bin, 'skraft.cmd'), 'utf8'), '@node "%~dp0skraft-launcher.mjs" %*\r\n')
    assert.deepEqual(JSON.parse(readFileSync(join(bin, 'target.json'), 'utf8')), { path: realCli })
  })
})

test('install under the Claude Code cache records the host, not the versioned folder', async () => {
  await withHome(async (home) => {
    const cli = fakePlugin(join(home, '.claude', 'plugins', 'cache', 'market', 'skraft', '1.0.0'), 'v1')
    await run(['install', '--no-path'], hostOf(home, { skraftPath: cli }).host)

    assert.deepEqual(JSON.parse(readFileSync(join(binOf(home), 'target.json'), 'utf8')), { host: 'claude-code' })
  })
})

test('the sh call prints the plugin version', posixOnly, async () => {
  await withHome(async (home) => {
    await run(['install', '--no-path'], hostOf(home).host)
    const result = spawnWith(home, join(binOf(home), 'skraft'), ['--version'])

    assert.deepEqual({ out: result.stdout, status: result.status }, { out: `${pluginVersion}\n`, status: 0 })
  })
})

test('the cmd call prints the plugin version', windowsOnly, async () => {
  await withHome(async (home) => {
    await run(['install', '--no-path'], hostOf(home).host)
    const result = spawnWith(home, 'cmd', ['/c', join(binOf(home), 'skraft.cmd'), '--version'])

    assert.deepEqual({ out: result.stdout, status: result.status }, { out: `${pluginVersion}\n`, status: 0 })
  })
})

test('under Claude Code the launcher runs the version the plugin list points to, after an update too', async () => {
  await withHome(async (home) => {
    const cache = (version) => join(home, '.claude', 'plugins', 'cache', 'market', 'skraft', version)
    const first = fakePlugin(cache('1.0.0'), 'running v1')
    listInstalled(home, cache('1.0.0'))
    await run(['install', '--no-path'], hostOf(home, { skraftPath: first }).host)
    const launcher = join(binOf(home), 'skraft-launcher.mjs')

    assert.equal(spawnWith(home, process.execPath, [launcher]).stdout, 'running v1\n')
    fakePlugin(cache('2.0.0'), 'running v2')
    listInstalled(home, cache('2.0.0'))
    assert.equal(spawnWith(home, process.execPath, [launcher]).stdout, 'running v2\n')
  })
})

test('a plugin that is gone gives the fixed message and exit 1', async () => {
  await withHome(async (home) => {
    const gone = join(home, 'gone', 'engine', 'drivers', 'cli', 'skraft.mjs')
    await run(['install', '--no-path'], hostOf(home, { skraftPath: gone }).host)
    const result = spawnWith(home, process.execPath, [join(binOf(home), 'skraft-launcher.mjs'), '--version'])

    assert.deepEqual({ out: result.stdout, err: result.stderr, status: result.status }, {
      out: '',
      err: 'skraft: the plugin was not found. Run node "<plugin folder>/engine/drivers/cli/skraft.mjs" install again.\n',
      status: 1,
    })
  })
})

test('under Claude Code with no skraft plugin listed, the same message and exit 1', async () => {
  await withHome(async (home) => {
    const cli = fakePlugin(join(home, '.claude', 'plugins', 'cache', 'market', 'skraft', '1.0.0'), 'v1')
    await run(['install', '--no-path'], hostOf(home, { skraftPath: cli }).host)
    const result = spawnWith(home, process.execPath, [join(binOf(home), 'skraft-launcher.mjs')])

    assert.deepEqual({ out: result.stdout, status: result.status }, { out: '', status: 1 })
    assert.match(result.stderr, /^skraft: the plugin was not found\. Run node ".*" install again\.\n$/)
  })
})

test('install adds the marked block to the profile of the shell once, keeping what it holds', async () => {
  await withHome(async (home) => {
    const { host } = hostOf(home)
    writeFileSync(join(home, '.zshrc'), 'alias ll="ls -l"')
    const first = await run(['install'], host)
    const once = readFileSync(join(home, '.zshrc'), 'utf8')
    const second = await run(['install'], host)

    assert.equal(first.code, 0)
    assert.equal(once, `alias ll="ls -l"\n# skraft\nexport PATH='${binOf(home)}':"$PATH"\n`)
    assert.equal(readFileSync(join(home, '.zshrc'), 'utf8'), once)
    assert.match(first.out.join('\n'), /added .* to PATH in .*\.zshrc[\s\S]*open a new terminal/)
    assert.match(second.out.join('\n'), /already adds/)
  })
})

test('the profile follows the shell and the OS', async () => {
  for (const [shell, platform, profile] of [
    ['/bin/bash', 'darwin', '.bash_profile'], ['/usr/bin/bash', 'linux', '.bashrc'], ['/bin/zsh', 'darwin', '.zshrc'],
    ['/usr/bin/fish', 'linux', '.profile'], [undefined, 'linux', '.profile'],
  ]) {
    await withHome(async (home) => {
      await run(['install'], hostOf(home, { platform, env: { PATH: '/usr/bin', SHELL: shell } }).host)

      assert.match(readFileSync(join(home, profile), 'utf8'), /^# skraft\nexport PATH=/, `${shell} on ${platform}`)
    })
  }
})

test('a folder already in PATH is left alone, on Windows whatever its case', async () => {
  await withHome(async (home) => {
    const bin = binOf(home)
    await run(['install'], hostOf(home, { env: { PATH: ['/usr/bin', bin].join(delimiter), SHELL: '/bin/zsh' } }).host)
    const { host, writes } = hostOf(home, { platform: 'win32', env: { PATH: ['C:\\x', bin.toUpperCase()].join(delimiter) } })
    const outcome = await run(['install'], host)

    assert.equal(existsSync(join(home, '.zshrc')), false)
    assert.deepEqual({ writes, code: outcome.code, said: /already in PATH/.test(outcome.out.join('\n')) }, { writes: [], code: 0, said: true })
  })
})

test('on Windows install asks for the bin folder in the user PATH, never a profile', async () => {
  await withHome(async (home) => {
    const { host, writes } = hostOf(home, { platform: 'win32', env: { Path: 'C:\\x' } })
    const outcome = await run(['install'], host)

    assert.deepEqual({ writes, code: outcome.code }, { writes: [binOf(home)], code: 0 })
    assert.equal(existsSync(join(home, '.zshrc')), false)
    assert.match(outcome.out.join('\n'), /user PATH[\s\S]*open a new terminal/)
  })
})

test('when the Windows user PATH cannot be written, install says so and exits 1', async () => {
  await withHome(async (home) => {
    const { host } = hostOf(home, { platform: 'win32', env: {}, setWindowsUserPath: () => false })
    const outcome = await run(['install'], host)

    assert.equal(outcome.code, 1)
    assert.deepEqual(outcome.out, [])
    assert.match(outcome.err.join('\n'), /user PATH could not be updated.*--no-path/)
  })
})

test('the Windows writer hands the folder to PowerShell as an environment value, with no setx', () => {
  const calls = []
  const spawn = (command, args, options) => { calls.push({ command, args, env: options.env.SKRAFT_BIN_DIR }); return { status: 0 } }
  const folder = "C:\\Users\\o'brien\\.skraft\\bin"

  assert.equal(windowsUserPathWriter(spawn)(folder), true)
  assert.equal(calls.length, 1)
  assert.deepEqual({ command: calls[0].command, flags: calls[0].args.slice(0, 2), env: calls[0].env }, { command: 'powershell', flags: ['-NoProfile', '-Command'], env: folder })
  assert.match(calls[0].args[2], /SetEnvironmentVariable\('Path'.*'User'\)/)
  assert.doesNotMatch(calls[0].args.join(' '), /setx|o'brien/)
  assert.equal(windowsUserPathWriter(() => ({ status: 1 }))(folder), false)
})

test('--no-path writes the calls but touches no profile and no user PATH, and prints the line for sh and PowerShell', async () => {
  for (const platform of ['linux', 'win32']) {
    await withHome(async (home) => {
      const { host, writes } = hostOf(home, { platform })
      const outcome = await run(['install', '--no-path'], host)
      const said = outcome.out.join('\n')

      assert.equal(outcome.code, 0)
      assert.deepEqual({ writes, zsh: existsSync(join(home, '.zshrc')), profile: existsSync(join(home, '.profile')) }, { writes: [], zsh: false, profile: false })
      assert.ok(existsSync(join(binOf(home), 'skraft-launcher.mjs')))
      assert.ok(said.includes(`export PATH='${binOf(home)}':"$PATH"`) && said.includes(`SetEnvironmentVariable('Path'`) && said.includes(binOf(home)))
    })
  }
})

test('an unknown or repeated option prints the usage, exit 2, and writes nothing', async () => {
  await withHome(async (home) => {
    for (const args of [['install', '--force'], ['install', '--no-path', '--no-path'], ['install', 'now']]) {
      const outcome = await run(args, hostOf(home).host)

      assert.deepEqual({ args, code: outcome.code, out: outcome.out, err: outcome.err }, { args, code: 2, out: [], err: [USAGE] })
    }
    assert.equal(existsSync(join(home, '.skraft')), false)
  })
})
