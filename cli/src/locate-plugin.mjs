import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Where the skraft plugin a host installed lives. Nothing is recorded: every call looks again,
 * so a plugin update by the host is followed without touching this package.
 *
 * Order: SKRAFT_PLUGIN_ROOT, then GitHub Copilot CLI, then Claude Code. When both hosts have
 * the plugin, Copilot CLI wins.
 *
 * @typedef {{ host: 'variable' | 'copilot' | 'claude-code', root: string, cli: string }} Located
 * @typedef {{ home: string, env: Record<string, string | undefined> }} Machine
 */

const CLI_PATH = ['engine', 'drivers', 'cli', 'skraft.mjs']
const PLUGIN = 'skraft'

/** @param {string} root @returns {string} */
const cliOf = (root) => join(root, ...CLI_PATH)

/** @param {'variable' | 'copilot' | 'claude-code'} host @param {string | undefined} root @returns {Located | undefined} */
const located = (host, root) => (root !== undefined && existsSync(cliOf(root)) ? { host, root, cli: cliOf(root) } : undefined)

/** @param {string} file @returns {any} the parsed JSON, undefined when it cannot be read */
const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

/** @param {string} folder @returns {string[]} the sub-folders, sorted; none when it cannot be read */
const subFolders = (folder) => {
  try {
    return readdirSync(folder, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  } catch {
    return []
  }
}

/** The marketplace named skraft first, then the others by name. @param {string} left @param {string} right */
const skraftMarketplaceFirst = (left, right) => Number(right === PLUGIN) - Number(left === PLUGIN) || left.localeCompare(right)

/**
 * Copilot CLI keeps each plugin as a Git clone it updates in place:
 * `<copilot home>/installed-plugins/<marketplace>/skraft/`.
 * @param {Machine} machine
 */
const copilot = ({ home, env }) => {
  const installed = join(env.COPILOT_HOME || join(home, '.copilot'), 'installed-plugins')
  const roots = subFolders(installed).sort(skraftMarketplaceFirst).map((marketplace) => join(installed, marketplace, PLUGIN))
  return roots.map((root) => located('copilot', root)).find(Boolean)
}

/** @param {any} install @returns {number} the update time, 0 when it is missing */
const updatedAt = (install) => Date.parse(install?.lastUpdated) || 0

/** Every install of every `skraft@<marketplace>` key; a value is a list of installs or one install. @param {any} listed @returns {any[]} */
const skraftInstalls = (listed) =>
  Object.entries(listed?.plugins ?? {})
    .filter(([name]) => name.startsWith(`${PLUGIN}@`))
    .flatMap(([, entry]) => [entry].flat())
    .filter((install) => typeof install?.installPath === 'string')

/**
 * Claude Code keeps one folder per version and lists the current one in
 * `<config dir>/plugins/installed_plugins.json`. The latest update wins.
 * @param {Machine} machine
 */
const claudeCode = ({ home, env }) => {
  const listed = readJson(join(env.CLAUDE_CONFIG_DIR || join(home, '.claude'), 'plugins', 'installed_plugins.json'))
  const installs = skraftInstalls(listed).sort((left, right) => updatedAt(right) - updatedAt(left))
  return installs.map((install) => located('claude-code', install.installPath)).find(Boolean)
}

/** @param {Machine} machine @returns {Located | undefined} */
const variable = ({ env }) => (env.SKRAFT_PLUGIN_ROOT ? located('variable', env.SKRAFT_PLUGIN_ROOT) : undefined)

/**
 * @param {Machine} machine
 * @returns {{ found: Located } | { missing: string }} the plugin, or why it was not found
 */
export const locatePlugin = (machine) => {
  if (machine.env.SKRAFT_PLUGIN_ROOT) {
    const found = variable(machine)
    return found ? { found } : { missing: 'variable' }
  }
  const found = copilot(machine) ?? claudeCode(machine)
  return found ? { found } : { missing: 'hosts' }
}
