import { stat } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { AZ_NOT_FROM_INSTALLER } from '../code-host/az-cli.mjs'

/**
 * Under Windows the Azure CLI is `az.cmd` (or a pip `az.bat`), which Node starts only through
 * cmd.exe, and cmd reads `"`, `&`, `|` and `%` again in what `%*` hands on: a title from a work
 * item such as `a" & calc & "` would run calc. The installer (MSI, winget) lays out
 * `<CLI2>\wbin\az.cmd`, which runs `"%~dp0\..\python.exe" -IBm azure.cli %*` with AZ_INSTALLER=MSI;
 * skraft starts that Python itself the same way, with an argv, so no shell reads any argument.
 * Any other az.cmd or az.bat is refused: az never starts through cmd.exe.
 *
 * @typedef {{ file: string, fileArgs: string[], throughCmd: false, env: Record<string, string> }} AzStart
 *   env: what the installer's az.cmd adds to the environment.
 * @param {string} located where the program was found
 * @param {string[]} args its arguments
 * @param {NodeJS.Platform} platform
 * @returns {Promise<AzStart | { refused: string } | null>} null when the program is no az script under Windows
 */
export const azLaunch = async (located, args, platform) => {
  if (platform !== 'win32' || !AZ_SCRIPTS.includes(basename(located).toLowerCase())) return null
  const python = resolve(dirname(located), '..', 'python.exe')
  if (!(await isFile(python))) return { refused: AZ_NOT_FROM_INSTALLER }
  return { file: python, fileArgs: ['-IBm', 'azure.cli', ...args], throughCmd: false, env: { AZ_INSTALLER: 'MSI' } }
}

/** The scripts that start az under Windows, only through cmd.exe. */
const AZ_SCRIPTS = Object.freeze(['az.cmd', 'az.bat'])

/** @param {string} path @returns {Promise<boolean>} */
const isFile = (path) => stat(path).then((entry) => entry.isFile(), () => false)
