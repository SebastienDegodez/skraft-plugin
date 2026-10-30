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

/** @param {any} entry an installed_plugins.json value: a list of installs or one install */
const installPathOf = (entry) => [entry].flat()[0]?.installPath

/** The install folder of the first `skraft@...` plugin Claude Code lists. @returns {string | undefined} */
const claudeCodeRoot = (configDir) => {
  const listed = readJson(join(configDir, 'plugins', 'installed_plugins.json'))
  const key = Object.keys(listed?.plugins ?? {}).find((name) => name.startsWith('skraft@'))
  return key === undefined ? undefined : installPathOf(listed.plugins[key])
}

/** @param {string | undefined} root */
const rootCli = (root) => (typeof root === 'string' ? join(root, ...CLI_PATH) : undefined)

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
