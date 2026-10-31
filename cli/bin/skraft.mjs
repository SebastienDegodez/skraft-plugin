#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { showBanner } from '../src/banner.mjs'
import { installedHosts, locatePlugin } from '../src/locate-plugin.mjs'
import { runSession } from '../src/session.mjs'
import { noticeUpdate, upgrade } from '../src/upgrade.mjs'

/** Fixed messages: nothing from the file system or an exception reaches the person. */
const MISSING = {
  variable:
    'skraft: SKRAFT_PLUGIN_ROOT names a folder without engine/drivers/cli/skraft.mjs. Point it at the skraft plugin folder, or unset it.',
  hosts: [
    'skraft: the skraft plugin was not found in GitHub Copilot CLI nor in Claude Code.',
    'Install it in your host (copilot plugin install skraft@skraft, or /plugin install skraft in Claude Code),',
    'or set SKRAFT_PLUGIN_ROOT to the plugin folder.',
  ].join('\n'),
}

const argv = process.argv.slice(2)
const home = homedir()
const env = process.env
const say = (line) => process.stderr.write(`${line}\n`)
const machine = { home, env }
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

/** `skraft` alone: a session in a terminal (SKRAFT_INTERACTIVE=1 forces it, 0 turns it off). */
const interactive = () => {
  if (argv.length > 0 || env.SKRAFT_INTERACTIVE === '0') return false
  return env.SKRAFT_INTERACTIVE === '1' || (Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY))
}

/** @param {string[]} args @returns {Promise<number>} */
const runChild = (args) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit' })
    child.on('error', () => resolve(1))
    child.on('exit', (code) => resolve(code ?? 1))
  })

/** One line of the session, in its own process: the plugin is found again for each line. @param {string[]} args */
const runLine = (args) => {
  if (args[0] === 'upgrade') return runChild([fileURLToPath(import.meta.url), ...args])
  const result = locatePlugin(machine)
  if (!('found' in result)) {
    say(MISSING[result.missing])
    return Promise.resolve(1)
  }
  return runChild([result.found.cli, ...args])
}

/** The engine's commands; none when the plugin cannot list them. @param {string} cli */
const catalogOf = (cli) => {
  try {
    const listed = JSON.parse(spawnSync(process.execPath, [cli, 'commands', '--json'], { encoding: 'utf8' }).stdout)
    return listed?.schema === 1 && Array.isArray(listed.commands) ? listed.commands : []
  } catch {
    return []
  }
}

const session = async (found) => {
  if (env.SKRAFT_BANNER !== '0') {
    await showBanner({ env, platform: process.platform, version, write: (text) => process.stderr.write(text), animate: Boolean(process.stderr.isTTY) })
  }
  await noticeUpdate({ version, home, env, now: Date.now(), say })
  const catalog = catalogOf(found.cli)
  // The child owns Ctrl-C while it runs; the session itself stays.
  process.on('SIGINT', () => {})
  await runSession({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY), catalog, run: runLine, say })
}

if (argv[0] === 'upgrade' && argv.length === 1) {
  process.exitCode = await upgrade({ version, home, env, hosts: installedHosts(machine), say })
} else {
  const result = locatePlugin(machine)
  if (!('found' in result)) {
    say(MISSING[result.missing])
    process.exitCode = 1
  } else if (interactive()) {
    await session(result.found)
  } else {
    if (argv[0] === '--version') say(`plugin: ${result.found.host} ${result.found.root}`)
    // Same process: process.argv is unchanged and `skraft decide` keeps the terminal.
    await import(pathToFileURL(result.found.cli).href)
  }
}
