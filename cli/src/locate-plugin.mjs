import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, isAbsolute } from 'node:path'

/**
 * Where the skraft plugin a host installed lives. Nothing is recorded: every call looks again,
 * so a plugin update by the host is followed without touching this package.
 *
 * Order: SKRAFT_PLUGIN_ROOT, then GitHub Copilot CLI, then Claude Code. When both hosts have
 * the plugin, Copilot CLI wins.
 *
 * @typedef {{ host: 'variable' | 'copilot' | 'claude-code', root: string, cli: string }} Located
 * @typedef {{ home: string, env: Record<string, string | undefined>, cwd: string }} Machine
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

/** @param {string} folder @param {string} cwd @returns {boolean} cwd is the folder or inside it */
const within = (folder, cwd) => {
  const path = relative(folder, cwd)
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

/** The more specific scope first, as Claude Code merges its settings: local, project, user. */
const SCOPE_RANK = { local: 3, project: 2, user: 1 }

/**
 * How well an install fits the working folder: an install scoped to a repository counts only
 * inside that repository (`projectPath`, read from Claude Code's file, not documented); one with
 * no scope or no projectPath comes after the user one. Undefined when it applies elsewhere.
 * @param {any} install @param {string} cwd @returns {number | undefined}
 */
const fitOf = (install, cwd) => {
  const rank = SCOPE_RANK[install?.scope] ?? 0
  if (rank < 2) return rank
  if (typeof install.projectPath !== 'string') return 0.5
  return within(install.projectPath, cwd) ? rank : undefined
}

/**
 * Claude Code keeps one folder per version and lists the current one in
 * `<config dir>/plugins/installed_plugins.json`: the install that fits the working folder best,
 * then the latest update.
 * @param {Machine} machine
 */
const claudeCode = ({ home, env, cwd }) => {
  const listed = readJson(join(env.CLAUDE_CONFIG_DIR || join(home, '.claude'), 'plugins', 'installed_plugins.json'))
  const installs = skraftInstalls(listed)
    .map((install) => ({ install, fit: fitOf(install, cwd) }))
    .filter(({ fit }) => fit !== undefined)
    .sort((left, right) => right.fit - left.fit || updatedAt(right.install) - updatedAt(left.install))
  return installs.map(({ install }) => located('claude-code', install.installPath)).find(Boolean)
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

/** Which hosts installed the plugin, for `skraft upgrade`. @param {Machine} machine */
export const installedHosts = (machine) => ({ copilot: copilot(machine) !== undefined, claudeCode: claudeCode(machine) !== undefined })
