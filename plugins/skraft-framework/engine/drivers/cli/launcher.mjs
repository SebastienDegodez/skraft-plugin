// Copied to ~/.skraft/bin/skraft-launcher.mjs by `skraft install`: it imports nothing from the plugin.
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const CLI_PATH = ['engine', 'drivers', 'cli', 'skraft.mjs']
const INSTALL_AGAIN = 'node "<plugin folder>/engine/drivers/cli/skraft.mjs" install'

/** @param {string} file @returns {any} the parsed JSON, undefined when it cannot be read */
const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

/** @param {string} installPath @returns {string} */
const cliOf = (installPath) => join(installPath, ...CLI_PATH)

/** @param {any} install an installed_plugins.json install @returns {boolean} the install folder holds the CLI */
const holdsCli = (install) => typeof install?.installPath === 'string' && existsSync(cliOf(install.installPath))

/** @param {any} install @returns {number} the update time, 0 when it is missing */
const updatedAt = (install) => Date.parse(install?.lastUpdated) || 0

/** @param {any} install @returns {number} 1 for the user scope */
const userRank = (install) => (install?.scope === 'user' ? 1 : 0)

/** Best first: user scope, then the latest update. @param {any} left @param {any} right */
const byPreference = (left, right) => userRank(right) - userRank(left) || updatedAt(right) - updatedAt(left)

/** Every install of every `skraft@...` key; a value is a list of installs or one install. @param {any} listed @returns {any[]} */
const skraftInstalls = (listed) =>
  Object.entries(listed?.plugins ?? {}).filter(([name]) => name.startsWith('skraft@')).flatMap(([, entry]) => [entry].flat())

/** The install folder Claude Code lists for skraft: the installs that hold the CLI, then the best of them. @returns {string | undefined} */
const claudeCodeRoot = (configDir) => {
  const listed = readJson(join(configDir, 'plugins', 'installed_plugins.json'))
  return skraftInstalls(listed).filter(holdsCli).sort(byPreference)[0]?.installPath
}

/** @param {string | undefined} root */
const rootCli = (root) => (typeof root === 'string' ? cliOf(root) : undefined)

/** The config folder target.json recorded, else the variable, else the default. @param {any} target */
const configDirOf = (target) => target.configDir ?? process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')

/** @param {any} target the content of target.json @returns {string | undefined} the skraft.mjs to run */
const skraftOf = (target) => {
  if (target?.host === 'claude-code') return rootCli(claudeCodeRoot(configDirOf(target)))
  return typeof target?.path === 'string' ? target.path : undefined
}

/** @param {string | undefined} skraft @returns {boolean} */
const found = (skraft) => skraft !== undefined && existsSync(skraft)

const skraft = skraftOf(readJson(join(dirname(fileURLToPath(import.meta.url)), 'target.json')))
if (found(skraft)) {
  await import(pathToFileURL(/** @type {string} */ (skraft)).href)
} else {
  process.stderr.write(`skraft: the plugin was not found. Run ${INSTALL_AGAIN} again.\n`)
  process.exitCode = 1
}
