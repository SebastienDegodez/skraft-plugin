import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { createLiveProcesses } from './live-processes.mjs'

/**
 * @typedef {import('../../application/ports/program-launcher.mjs').ProgramLauncher} ProgramLauncher
 * @typedef {{ platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv }} LauncherHost
 */

/**
 * Where Git for Windows keeps its bash, under the folders Windows names in the environment.
 * Not the `bash` on the PATH, which is often WSL's.
 */
const GIT_BASH = Object.freeze([
  ['ProgramFiles', 'Git', 'bin', 'bash.exe'],
  ['ProgramW6432', 'Git', 'bin', 'bash.exe'],
  ['ProgramFiles(x86)', 'Git', 'bin', 'bash.exe'],
  ['LOCALAPPDATA', 'Programs', 'Git', 'bin', 'bash.exe'],
])

/** The PowerShell programs, newest first, each with the arguments that read a command line from its argument. */
const POWERSHELLS = Object.freeze(['pwsh', 'powershell'])

/**
 * @param {{ root: string } & LauncherHost} options root: the working copy
 * @returns {ProgramLauncher}
 */
export const createProgramLauncher = ({ root, platform = process.platform, env = process.env }) => {
  const processes = createLiveProcesses({ platform, env })
  return Object.freeze({ start: (request) => launch(request, { root, processes, host: { platform, env } }) })
}

/**
 * @param {import('../../application/ports/program-launcher.mjs').LaunchRequest} request
 * @param {{ root: string, processes: ReturnType<typeof createLiveProcesses>, host: Required<LauncherHost> }} where
 * @returns {Promise<import('../../application/ports/program-launcher.mjs').Launched>}
 */
const launch = async ({ command, cwd, timeoutMs, maxOutputBytes, onData }, { root, processes, host }) => {
  const folder = await folderIn(root, cwd)
  if (folder === null) return { ok: false, reason: 'the folder is outside the working copy or does not exist' }
  const how = typeof command === 'string' ? await shellFor(command, host) : { argv: command, shell: null }
  if (how === null) return { ok: false, reason: 'no shell was found on this machine' }
  const program = await processes.start({ argv: how.argv, cwd: folder, timeoutMs, maxOutputBytes, onData })
  return { ok: true, argv: how.argv, shell: how.shell, program }
}

/**
 * The absolute folder, when it exists and, links resolved, stays inside the working copy.
 * @param {string} root @param {string} cwd @returns {Promise<string | null>}
 */
const folderIn = async (root, cwd) => {
  try {
    const real = await realpath(resolve(root, cwd))
    const outside = relative(await realpath(root), real)
    return outside.startsWith('..') || isAbsolute(outside) || !(await stat(real)).isDirectory() ? null : real
  } catch {
    return null
  }
}

/**
 * The argv that runs a command line through the machine's shell: `sh -c` outside Windows;
 * under Windows Git Bash when it is installed, else PowerShell.
 * @param {string} command @param {Required<LauncherHost>} host
 * @returns {Promise<{ argv: string[], shell: string } | null>}
 */
const shellFor = async (command, { platform, env }) => {
  if (platform !== 'win32') return { argv: ['sh', '-c', command], shell: 'sh' }
  const bash = await gitBash(env)
  if (bash !== null) return { argv: [bash, '-c', command], shell: 'git-bash' }
  const shell = await firstPowerShell(env)
  return shell === null ? null : { argv: [shell, '-NoProfile', '-NonInteractive', '-Command', command], shell }
}

/** @param {NodeJS.ProcessEnv} env @returns {Promise<string | null>} */
const gitBash = async (env) => {
  for (const [variable, ...parts] of GIT_BASH) {
    const base = env[variable]
    if (base !== undefined && (await isFile(join(base, ...parts)))) return join(base, ...parts)
  }
  return null
}

/** The first PowerShell program on the PATH, by its name. @param {NodeJS.ProcessEnv} env @returns {Promise<string | null>} */
const firstPowerShell = async (env) => {
  const folders = (env.Path ?? env.PATH ?? '').split(';').filter((folder) => folder !== '')
  for (const name of POWERSHELLS) {
    for (const folder of folders) if (await isFile(join(folder, `${name}.exe`))) return name
  }
  return null
}

/** @param {string} path */
const isFile = (path) => stat(path).then((entry) => entry.isFile(), () => false)
