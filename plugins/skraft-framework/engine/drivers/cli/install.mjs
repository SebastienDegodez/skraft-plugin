import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, delimiter, join, sep } from 'node:path'

/**
 * @typedef {{ home: string, env: Record<string, string | undefined>, platform: string, skraftPath: string, launcherSource: string, setWindowsUserPath: (binDir: string) => boolean }} InstallHost
 *   home: the person's home folder; env: the environment (PATH, SHELL); skraftPath: the absolute
 *   skraft.mjs that runs `install`; launcherSource: the launcher file to copy;
 *   setWindowsUserPath: adds a folder to the user PATH, false when it could not.
 * @typedef {{ out: (line: string) => void, err: (line: string) => void }} Console
 */

const MARKER = '# skraft'

/** @param {string} home */
const binDirOf = (home) => join(home, '.skraft', 'bin')

/** @param {InstallHost} host */
const underClaudeCache = ({ home, skraftPath }) => skraftPath.startsWith(join(home, '.claude', 'plugins', 'cache') + sep)

/** What the launcher runs. @param {InstallHost} host */
const targetOf = (host) => (underClaudeCache(host) ? { host: 'claude-code' } : { path: host.skraftPath })

/** @param {string} file @param {string} text @param {number} [mode] */
const write = (file, text, mode = 0o644) => {
  writeFileSync(file, text)
  chmodSync(file, mode)
}

/** @param {InstallHost} host @param {string} bin */
const writeShims = (host, bin) => {
  const launcher = join(bin, 'skraft-launcher.mjs')
  mkdirSync(bin, { recursive: true })
  copyFileSync(host.launcherSource, launcher)
  write(join(bin, 'skraft'), `#!/bin/sh\nexec node "${launcher.replaceAll('\\', '/')}" "$@"\n`, 0o755)
  write(join(bin, 'skraft.cmd'), '@node "%~dp0skraft-launcher.mjs" %*\r\n')
  write(join(bin, 'target.json'), `${JSON.stringify(targetOf(host), null, 2)}\n`)
}

/** @param {string} folder @param {string} platform */
const normalized = (folder, platform) => {
  const bare = folder.length > 1 && /[\\/]$/.test(folder) ? folder.slice(0, -1) : folder
  return platform === 'win32' ? bare.toLowerCase() : bare
}

/** @param {InstallHost} host @param {string} bin */
const onPath = ({ env, platform }, bin) => {
  const folders = (env.PATH ?? env.Path ?? '').split(delimiter)
  return folders.some((folder) => normalized(folder, platform) === normalized(bin, platform))
}

/** @param {InstallHost} host @returns {string} the profile the person's shell reads */
const profileOf = ({ home, env, platform }) => {
  const shell = basename(env.SHELL ?? '')
  if (shell === 'zsh') return join(home, '.zshrc')
  if (shell === 'bash') return join(home, platform === 'darwin' ? '.bash_profile' : '.bashrc')
  return join(home, '.profile')
}

/** @param {string} bin */
const quoted = (bin) => `'${bin.replaceAll("'", "'\\''")}'`

/** @param {string} file @returns {string} */
const readOrEmpty = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '')

/** Appends the marked block once. @param {InstallHost} host @param {string} bin @returns {string[]} what changed */
const addToProfile = (host, bin) => {
  const profile = profileOf(host)
  const current = readOrEmpty(profile)
  if (current.split('\n').includes(MARKER)) return [`${profile} already adds ${bin} to PATH`]
  const separator = current === '' || current.endsWith('\n') ? '' : '\n'
  writeFileSync(profile, `${current}${separator}${MARKER}\nexport PATH=${quoted(bin)}:"$PATH"\n`)
  return [`added ${bin} to PATH in ${profile}`]
}

/** @param {InstallHost} host @param {string} bin @returns {string[] | undefined} what changed, undefined when the user PATH was not written */
const addToWindowsPath = (host, bin) => (host.setWindowsUserPath(bin) ? [`added ${bin} to your user PATH`] : undefined)

/** @param {InstallHost} host @param {string} bin */
const addToPath = (host, bin) => (host.platform === 'win32' ? addToWindowsPath(host, bin) : addToProfile(host, bin))

/** @param {string} bin @returns {string[]} */
const manualLines = (bin) => [
  `left the PATH alone; to add ${bin} yourself:`,
  `  sh:         export PATH=${quoted(bin)}:"$PATH"`,
  `  PowerShell: [Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path', 'User') + ';${bin.replaceAll("'", "''")}', 'User')`,
]

/** @param {InstallHost} host @param {string} bin @param {boolean} wantPath @returns {string[] | undefined} */
const pathLines = (host, bin, wantPath) => {
  if (!wantPath) return manualLines(bin)
  return onPath(host, bin) ? [`${bin} is already in PATH`] : addToPath(host, bin)
}

/** @param {string} bin @param {Console} console */
const failedPath = (bin, console) => {
  console.err(`the calls are in ${bin} but the user PATH could not be updated; run skraft install --no-path and add the folder yourself`)
  return 1
}

/**
 * `skraft install`: the launcher and the `skraft` / `skraft.cmd` calls in ~/.skraft/bin, then the PATH.
 * @param {InstallHost} host @param {{ path: boolean }} options @param {Console} console @returns {number} exit code
 */
export const installShims = (host, { path }, console) => {
  const bin = binDirOf(host.home)
  writeShims(host, bin)
  const lines = pathLines(host, bin, path)
  if (lines === undefined) return failedPath(bin, console)
  for (const line of [`wrote the skraft launcher and calls in ${bin}`, ...lines, 'open a new terminal, then run: skraft --version']) console.out(line)
  return 0
}
