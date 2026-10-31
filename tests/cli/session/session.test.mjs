import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const bin = fileURLToPath(new URL('../../../cli/bin/skraft.mjs', import.meta.url))

/** A plugin whose engine prints its usage with no argument, else the arguments it received. */
const withPlugin = (body) => {
  const home = mkdtempSync(join(tmpdir(), 'skraft-session-'))
  const cliDir = join(home, '.copilot', 'installed-plugins', 'skraft', 'skraft', 'engine', 'drivers', 'cli')
  mkdirSync(cliDir, { recursive: true })
  writeFileSync(
    join(cliDir, 'skraft.mjs'),
    [
      "const args = process.argv.slice(2)",
      "if (args.length === 0) { process.stderr.write('usage: skraft --version\\n       skraft status [--json]\\n       skraft decide <answer>\\n'); process.exitCode = 2 }",
      "else console.log('engine', JSON.stringify(args))",
    ].join('\n'),
  )
  try {
    return body(home)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}

/** `skraft` alone, the session forced on (a pipe is not a terminal), lines typed on stdin. */
const session = (home, lines, extraEnv = {}) => {
  const { CLAUDE_CONFIG_DIR: _c, COPILOT_HOME: _h, SKRAFT_PLUGIN_ROOT: _s, SKRAFT_BANNER: _b, NO_COLOR: _n, CI: _ci, ...inherited } = process.env
  return spawnSync(process.execPath, [bin], {
    encoding: 'utf8',
    input: lines.map((line) => `${line}\n`).join(''),
    env: { ...inherited, HOME: home, USERPROFILE: home, SKRAFT_INTERACTIVE: '1', SKRAFT_BANNER: '0', SKRAFT_UPDATE_CHECK: '0', ...extraEnv },
  })
}

test('each line runs as a skraft command, in order, with quoted words kept whole', () => {
  withPlugin((home) => {
    const run = session(home, ['status --json', 'decide "two words"', 'skraft --version'])

    assert.equal(run.status, 0, run.stderr)
    assert.equal(run.stdout.replaceAll('skraft › ', ''), [
      'engine ["status","--json"]',
      'engine ["decide","two words"]',
      'engine ["--version"]',
      '',
    ].join('\n'))
  })
})

test('the welcome line names the commands of the engine usage, so the session follows the plugin', () => {
  withPlugin((home) => {
    const run = session(home, [])

    assert.match(run.stderr, /^type a command \(--version, status, decide…\), help for the list, exit to leave$/m)
  })
})

test('exit leaves the session: the lines after it never run', () => {
  withPlugin((home) => {
    const run = session(home, ['status', 'exit', 'decide yes'])

    assert.equal(run.status, 0)
    assert.equal(run.stdout.replaceAll('skraft › ', ''), 'engine ["status"]\n')
  })
})

test('help prints the engine usage; an unclosed quote is refused without running anything', () => {
  withPlugin((home) => {
    const run = session(home, ['decide "open', 'help'])

    assert.equal(run.stdout.replaceAll('skraft › ', ''), '')
    assert.match(run.stderr, /skraft: a quote is not closed\nusage: skraft --version/)
  })
})

test('the session opens with the banner on stderr, uncoloured with NO_COLOR', () => {
  withPlugin((home) => {
    const run = session(home, ['exit'], { SKRAFT_BANNER: '1', NO_COLOR: '' })

    assert.equal(run.stdout.replaceAll('skraft › ', ''), '')
    assert.match(run.stderr, /██.*\n[\s\S]*AI-powered digital craft · cli \d+\.\d+\.\d+/)
    assert.doesNotMatch(run.stderr, /\x1b\[/)
  })
})

test('SKRAFT_INTERACTIVE=0 keeps `skraft` alone a one-shot call to the engine', () => {
  withPlugin((home) => {
    const run = session(home, ['status'], { SKRAFT_INTERACTIVE: '0' })

    assert.equal(run.status, 2)
    assert.equal(run.stdout, '')
    assert.match(run.stderr, /^usage: skraft --version/)
  })
})
