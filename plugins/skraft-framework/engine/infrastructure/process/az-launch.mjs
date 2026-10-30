import { stat } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'

/**
 * Under Windows the Azure CLI is `az.cmd`, which Node starts only through cmd.exe, and cmd
 * expands `%` and reads `"`, `&` and `|` again in what `%*` hands on: a pull request's title
 * would not survive it. The installer (MSI, winget) lays out `<CLI2>\wbin\az.cmd`, which runs
 * `"%~dp0\..\python.exe" -IBm azure.cli %*`; skraft starts that Python itself with the same
 * flags and an argv, so no shell reads any argument. Any other az.cmd (pip, a shim) starts
 * through cmd.exe as every other `.cmd` does.
 *
 * @param {string} located where the program was found
 * @param {string[]} args its arguments
 * @param {NodeJS.Platform} platform
 * @returns {Promise<{ file: string, fileArgs: string[], throughCmd: false } | null>} null when the program is not the installer's az.cmd
 */
export const azPython = async (located, args, platform) => {
  if (platform !== 'win32' || basename(located).toLowerCase() !== 'az.cmd') return null
  const python = resolve(dirname(located), '..', 'python.exe')
  return (await isFile(python)) ? { file: python, fileArgs: ['-IBm', 'azure.cli', ...args], throughCmd: false } : null
}

/** @param {string} path @returns {Promise<boolean>} */
const isFile = (path) => stat(path).then((entry) => entry.isFile(), () => false)
