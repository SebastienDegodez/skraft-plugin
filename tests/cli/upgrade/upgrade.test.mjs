import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const bin = fileURLToPath(new URL('../../../cli/bin/skraft.mjs', import.meta.url))
const cliVersion = JSON.parse(readFileSync(new URL('../../../cli/package.json', import.meta.url), 'utf8')).version

const withHome = async (body) => {
  const home = mkdtempSync(join(tmpdir(), 'skraft-upgrade-'))
  try {
    return await body(home)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}

const engineAt = (root) => {
  mkdirSync(join(root, 'engine', 'drivers', 'cli'), { recursive: true })
  writeFileSync(join(root, 'engine', 'drivers', 'cli', 'skraft.mjs'), "console.log('engine')\n")
}

const copilotPlugin = (home) => engineAt(join(home, '.copilot', 'installed-plugins', 'skraft', 'skraft'))

const claudePlugin = (home, marketplace) => {
  const installPath = join(home, '.claude', 'plugins', 'cache', marketplace, 'skraft', '2.0.0')
  engineAt(installPath)
  writeFileSync(
    join(home, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({ plugins: { [`skraft@${marketplace}`]: [{ installPath }], 'other@x': [{ installPath: '/x' }] } }),
  )
}

/** npm, copilot and claude stand-ins that log how they were called; `fails` exit 1. */
const fakePrograms = (home, fails = []) => {
  const dir = join(home, 'fake bin')
  const log = join(home, 'calls.log')
  mkdirSync(dir, { recursive: true })
  for (const name of ['npm', 'copilot', 'claude']) {
    const code = fails.includes(name) ? 1 : 0
    if (process.platform === 'win32') {
      writeFileSync(join(dir, `${name}.cmd`), `@echo ${name} %*>>"${log}"\r\n@exit /b ${code}\r\n`)
    } else {
      writeFileSync(join(dir, name), `#!/bin/sh\necho "${name} $*" >> "${log}"\nexit ${code}\n`)
      chmodSync(join(dir, name), 0o755)
    }
  }
  return { dir, calls: () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split(/\r?\n/) : []) }
}

const cleanEnv = (home, extra = {}) => {
  const { CLAUDE_CONFIG_DIR: _c, COPILOT_HOME: _h, SKRAFT_PLUGIN_ROOT: _s, CI: _ci, ...inherited } = process.env
  return { ...inherited, HOME: home, USERPROFILE: home, ...extra }
}

const upgrade = (home, programs) => {
  const PATH = `${programs.dir}${delimiter}${process.env.PATH ?? process.env.Path ?? ''}`
  return spawnSync(process.execPath, [bin, 'upgrade'], { encoding: 'utf8', env: cleanEnv(home, { PATH, Path: PATH }) })
}

test('upgrade installs the latest skraft command, then updates the plugin in each host that has it', async () => {
  await withHome((home) => {
    copilotPlugin(home)
    claudePlugin(home, 'skraft')
    const programs = fakePrograms(home)
    const run = upgrade(home, programs)

    assert.equal(run.status, 0, run.stderr)
    assert.deepEqual(programs.calls(), [
      'npm install --global @skraft/cli@latest',
      'copilot plugin update skraft',
      'claude plugin update skraft@skraft',
    ])
    assert.match(run.stderr, /the plugin in Claude Code \(skraft@skraft; open a new session to load it\) updated/)
  })
})

test('upgrade leaves alone a host that has no skraft plugin', async () => {
  await withHome((home) => {
    copilotPlugin(home)
    const programs = fakePrograms(home)

    upgrade(home, programs)
    assert.deepEqual(programs.calls(), ['npm install --global @skraft/cli@latest', 'copilot plugin update skraft'])
  })
})

test('a failed step makes upgrade exit 1 and says which one, without stopping the others', async () => {
  await withHome((home) => {
    copilotPlugin(home)
    claudePlugin(home, 'skraft')
    const programs = fakePrograms(home, ['copilot'])
    const run = upgrade(home, programs)

    assert.equal(run.status, 1)
    assert.equal(programs.calls().length, 3)
    assert.match(run.stderr, /skraft upgrade: the plugin in GitHub Copilot CLI failed \(code 1\)/)
  })
})

/** A registry answering the dist-tags of @skraft/cli; the session runs in an async child so it can answer. */
const withRegistry = async (distTags, body) => {
  let asked = 0
  const server = createServer((request, response) => {
    asked += 1
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify(request.url === '/-/package/%40skraft%2Fcli/dist-tags' ? distTags : {}))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    return await body(`http://127.0.0.1:${server.address().port}`, () => asked)
  } finally {
    server.close()
  }
}

const openSession = (home, registry) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [bin], {
      env: cleanEnv(home, { SKRAFT_INTERACTIVE: '1', SKRAFT_BANNER: '0', SKRAFT_REGISTRY: registry }),
    })
    let stderr = ''
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('exit', () => resolve(stderr))
    child.stdin.end('exit\n')
  })

test('a session says when a newer skraft command exists, and asks the registry at most once a day', async () => {
  await withHome((home) => {
    copilotPlugin(home)
    return withRegistry({ latest: '99.0.0', alpha: '99.1.0-alpha.3' }, async (registry, asked) => {
      assert.match(await openSession(home, registry), new RegExp(`skraft 99\\.0\\.0 is available \\(installed: ${cliVersion.replaceAll('.', '\\.')}\\); type upgrade`))
      assert.match(await openSession(home, registry), /skraft 99\.0\.0 is available/)
      assert.equal(asked(), 1)
    })
  })
})

test('a session stays quiet when the installed command is the latest one', async () => {
  await withHome((home) => {
    copilotPlugin(home)
    return withRegistry({ latest: cliVersion }, async (registry) => {
      assert.doesNotMatch(await openSession(home, registry), /is available/)
    })
  })
})
