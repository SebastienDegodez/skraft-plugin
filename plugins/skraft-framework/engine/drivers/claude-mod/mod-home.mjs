import { joinPath } from './mod-files.mjs'

/**
 * The home folder of the Claude Code mod, the one a Node host of the same machine reads: the one
 * node names (`os.homedir()`, through the engine's lock-file command), else the one the
 * environment names (`$.env.get('HOME')`, else `USERPROFILE`) when node cannot tell; null when
 * neither can. Node first: on Windows `os.homedir()` reads USERPROFILE where a HOME set by MSYS2,
 * Cygwin or hand may name another folder, and the keys and ~/.skraft/config.json must be the
 * ones the CLI and the Copilot host read. Asked once per composition.
 * @param {ModHost} host
 * @returns {() => Promise<string | null>}
 */
export const modHome = (host) => {
  /** @type {Promise<string | null> | null} */
  let found = null
  return () => {
    found ??= homeOf(host)
    return found
  }
}

/** @typedef {{ home: () => Promise<string | null>, run: import('./mod-processes.mjs').ModRun, pluginRoot: string }} ModHost */

/** @param {ModHost} host */
const homeOf = async (host) => (await nodeHome(host)) ?? host.home()

/** `os.homedir()` printed by node; null when node cannot start or prints none. @param {ModHost} host */
const nodeHome = async ({ run, pluginRoot }) => {
  const command = joinPath(pluginRoot, 'engine', 'infrastructure', 'tracking', 'lock-file-command.mjs')
  const result = await run(['node', command, 'home'], { timeoutMs: HOME_TIMEOUT_MS }).catch(() => null)
  return result?.exitCode === 0 && result.stdout.trim() !== '' ? result.stdout.trim() : null
}

const HOME_TIMEOUT_MS = 20_000
