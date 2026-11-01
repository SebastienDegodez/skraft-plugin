import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const bin = fileURLToPath(new URL('../../../cli/bin/skraft.mjs', import.meta.url))

/** A home folder with a space in its name: the paths users really have under Windows. */
const withHome = (body) => {
  const parent = mkdtempSync(join(tmpdir(), 'skraft-cli-'))
  const home = join(parent, 'home with space')
  mkdirSync(home)
  try {
    return body(home)
  } finally {
    rmSync(parent, { recursive: true, force: true })
  }
}

/** A plugin whose engine prints who it is and the arguments it received. */
const fakePlugin = (root, marker) => {
  const cliDir = join(root, 'engine', 'drivers', 'cli')
  mkdirSync(cliDir, { recursive: true })
  writeFileSync(join(cliDir, 'skraft.mjs'), `console.log(${JSON.stringify(marker)}, JSON.stringify(process.argv.slice(2)))\n`)
  return root
}

const copilotPlugin = (home, marker, marketplace = 'skraft') =>
  fakePlugin(join(home, '.copilot', 'installed-plugins', marketplace, 'skraft'), marker)

/** Claude Code lists the current folder of each plugin in installed_plugins.json. */
const claudePlugins = (home, installs) => {
  mkdirSync(join(home, '.claude', 'plugins'), { recursive: true })
  const plugins = { 'other@market': [{ installPath: join(home, 'elsewhere') }], ...installs }
  writeFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins }))
}

const claudePlugin = (home, version, marker) =>
  fakePlugin(join(home, '.claude', 'plugins', 'cache', 'skraft', 'skraft', version), marker)

const skraft = (home, args, extraEnv = {}, cwd = home) => {
  const { CLAUDE_CONFIG_DIR: _c, COPILOT_HOME: _h, SKRAFT_PLUGIN_ROOT: _s, SKRAFT_BANNER: _b, NO_COLOR: _n, CI: _ci, ...inherited } = process.env
  return spawnSync(process.execPath, [bin, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...inherited, HOME: home, USERPROFILE: home, ...extraEnv },
  })
}

test('runs the engine of the plugin Copilot CLI installed, with the arguments untouched', () => {
  withHome((home) => {
    copilotPlugin(home, 'copilot')
    const run = skraft(home, ['decide', 'yes', '--reason', 'two words'])

    assert.equal(run.status, 0, run.stderr)
    assert.equal(run.stdout, 'copilot ["decide","yes","--reason","two words"]\n')
  })
})

test('runs the engine Claude Code lists as current when Copilot CLI has no skraft', () => {
  withHome((home) => {
    claudePlugins(home, {
      'skraft@skraft': [
        { installPath: claudePlugin(home, '2.0.0', 'claude 2.0.0'), lastUpdated: '2026-10-01T00:00:00Z' },
        { installPath: claudePlugin(home, '2.1.0', 'claude 2.1.0'), lastUpdated: '2026-10-20T00:00:00Z' },
      ],
    })
    const run = skraft(home, ['status'])

    assert.equal(run.status, 0, run.stderr)
    assert.equal(run.stdout, 'claude 2.1.0 ["status"]\n')
  })
})

test('follows a Claude Code update without being installed again', () => {
  withHome((home) => {
    claudePlugins(home, { 'skraft@skraft': { installPath: claudePlugin(home, '2.0.0', 'old') } })
    assert.equal(skraft(home, ['status']).stdout, 'old ["status"]\n')

    claudePlugins(home, { 'skraft@skraft': { installPath: claudePlugin(home, '2.1.0', 'new') } })
    assert.equal(skraft(home, ['status']).stdout, 'new ["status"]\n')
  })
})

test('prefers Copilot CLI when both hosts installed skraft', () => {
  withHome((home) => {
    copilotPlugin(home, 'copilot')
    claudePlugins(home, { 'skraft@skraft': [{ installPath: claudePlugin(home, '2.1.0', 'claude') }] })
    const run = skraft(home, ['doctor'])

    assert.equal(run.status, 0, run.stderr)
    assert.equal(run.stdout, 'copilot ["doctor"]\n')
  })
})

test('prefers the marketplace named skraft over another Copilot CLI marketplace', () => {
  withHome((home) => {
    copilotPlugin(home, 'fork', 'a-fork')
    copilotPlugin(home, 'official', 'skraft')

    assert.equal(skraft(home, ['status']).stdout, 'official ["status"]\n')
  })
})

test('a Claude Code install scoped to another repository never wins; one scoped to this repository wins over the user one', () => {
  withHome((home) => {
    const here = join(home, 'work', 'payment')
    const elsewhere = join(home, 'work', 'other')
    mkdirSync(join(here, 'src'), { recursive: true })
    mkdirSync(elsewhere, { recursive: true })
    const user = { scope: 'user', installPath: claudePlugin(home, '2.0.0', 'user'), lastUpdated: '2026-10-01T00:00:00Z' }
    const other = { scope: 'project', projectPath: elsewhere, installPath: claudePlugin(home, '2.2.0', 'other repository'), lastUpdated: '2026-10-30T00:00:00Z' }
    claudePlugins(home, { 'skraft@skraft': [other, user] })

    assert.equal(skraft(home, ['status'], {}, join(here, 'src')).stdout, 'user ["status"]\n')

    const mine = { scope: 'local', projectPath: here, installPath: claudePlugin(home, '2.1.0', 'this repository'), lastUpdated: '2026-10-02T00:00:00Z' }
    claudePlugins(home, { 'skraft@skraft': [other, user, mine] })

    assert.equal(skraft(home, ['status'], {}, join(here, 'src')).stdout, 'this repository ["status"]\n')
    assert.equal(skraft(home, ['status'], {}, elsewhere).stdout, 'other repository ["status"]\n')
  })
})

test('skips a Claude Code entry whose folder lost its engine', () => {
  withHome((home) => {
    claudePlugins(home, {
      'skraft@skraft': [
        { installPath: join(home, 'gone'), lastUpdated: '2026-10-30T00:00:00Z' },
        { installPath: claudePlugin(home, '2.0.0', 'kept'), lastUpdated: '2026-10-01T00:00:00Z' },
      ],
    })

    assert.equal(skraft(home, ['status']).stdout, 'kept ["status"]\n')
  })
})

test('SKRAFT_PLUGIN_ROOT wins over both hosts', () => {
  withHome((home) => {
    copilotPlugin(home, 'copilot')
    const root = fakePlugin(join(home, 'my clone'), 'clone')
    const run = skraft(home, ['status'], { SKRAFT_PLUGIN_ROOT: root })

    assert.equal(run.status, 0, run.stderr)
    assert.equal(run.stdout, 'clone ["status"]\n')
  })
})

test('a SKRAFT_PLUGIN_ROOT without an engine stops instead of falling back to a host', () => {
  withHome((home) => {
    copilotPlugin(home, 'copilot')
    const run = skraft(home, ['status'], { SKRAFT_PLUGIN_ROOT: join(home, 'nothing here') })

    assert.equal(run.status, 1)
    assert.equal(run.stdout, '')
    assert.match(run.stderr, /^skraft: SKRAFT_PLUGIN_ROOT names a folder without engine\/drivers\/cli\/skraft\.mjs\./)
  })
})

test('without any plugin, says how to install one and exits 1', () => {
  withHome((home) => {
    const run = skraft(home, ['status'])

    assert.equal(run.status, 1)
    assert.equal(run.stdout, '')
    assert.match(run.stderr, /^skraft: the skraft plugin was not found in GitHub Copilot CLI nor in Claude Code\./)
    assert.match(run.stderr, /SKRAFT_PLUGIN_ROOT/)
  })
})

test('--version says which host and folder answered, on stderr only', () => {
  withHome((home) => {
    const root = copilotPlugin(home, 'copilot')
    const run = skraft(home, ['--version'])

    assert.equal(run.stdout, 'copilot ["--version"]\n')
    assert.equal(run.stderr, `plugin: copilot ${root}\n`)
  })
})

test('honours COPILOT_HOME and CLAUDE_CONFIG_DIR', () => {
  withHome((home) => {
    const copilotHome = join(home, 'custom copilot')
    fakePlugin(join(copilotHome, 'installed-plugins', 'skraft', 'skraft'), 'custom copilot')
    assert.equal(skraft(home, ['status'], { COPILOT_HOME: copilotHome }).stdout, 'custom copilot ["status"]\n')

    const claudeDir = join(home, 'custom claude')
    mkdirSync(join(claudeDir, 'plugins'), { recursive: true })
    const installPath = fakePlugin(join(claudeDir, 'plugins', 'cache', 'skraft', 'skraft', '2.0.0'), 'custom claude')
    writeFileSync(join(claudeDir, 'plugins', 'installed_plugins.json'), JSON.stringify({ plugins: { 'skraft@skraft': [{ installPath }] } }))
    assert.equal(skraft(home, ['status'], { CLAUDE_CONFIG_DIR: claudeDir }).stdout, 'custom claude ["status"]\n')
  })
})

test('outside a terminal, writes no banner: scripts and agents read the same output as before', () => {
  withHome((home) => {
    copilotPlugin(home, 'copilot')
    const run = skraft(home, ['status'])

    assert.equal(run.stderr, '')
    assert.equal(run.stdout, 'copilot ["status"]\n')
  })
})

test('a one-shot command never shows the banner, even with SKRAFT_BANNER set', () => {
  withHome((home) => {
    copilotPlugin(home, 'copilot')

    assert.equal(skraft(home, ['status'], { SKRAFT_BANNER: '1' }).stderr, '')
  })
})
