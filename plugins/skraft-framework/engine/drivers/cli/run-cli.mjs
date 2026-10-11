/**
 * @typedef {{ out: (line: string) => void, err: (line: string) => void }} Console
 * @typedef {{ pluginVersion: () => string }} CliServices
 */

export const USAGE = 'usage: skraft --version'

/**
 * @param {string[]} args command-line arguments after the script path
 * @param {CliServices} services
 * @param {Console} console
 * @returns {number} exit code
 */
export const runCli = ([command], services, console) => {
  if (command === '--version') {
    console.out(services.pluginVersion())
    return 0
  }
  console.err(USAGE)
  return 2
}
