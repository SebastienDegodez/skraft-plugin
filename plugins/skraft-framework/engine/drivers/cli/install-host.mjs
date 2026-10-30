import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

// The folder reaches PowerShell through the environment, a value no shell interpolates.
const ADD_TO_USER_PATH = [
  "$bin = $env:SKRAFT_BIN_DIR; $user = [Environment]::GetEnvironmentVariable('Path', 'User')",
  "if (-not $user) { $user = '' }",
  "if (($user -split ';') -notcontains $bin) { [Environment]::SetEnvironmentVariable('Path', ($user.TrimEnd(';') + ';' + $bin).TrimStart(';'), 'User') }",
].join('; ')

/**
 * Adds a folder to the user PATH through PowerShell (never setx, which cuts at 1024 characters).
 * @param {typeof spawnSync} [spawn]
 * @returns {(binDir: string) => boolean}
 */
export const windowsUserPathWriter = (spawn = spawnSync) => (binDir) =>
  spawn('powershell', ['-NoProfile', '-Command', ADD_TO_USER_PATH], { env: { ...process.env, SKRAFT_BIN_DIR: binDir }, windowsHide: true }).status === 0

/** The real host of `skraft install`. @param {string} skraftUrl import.meta.url of skraft.mjs @returns {import('./install.mjs').InstallHost} */
export const nodeInstallHost = (skraftUrl) => ({
  home: homedir(),
  env: process.env,
  platform: process.platform,
  skraftPath: fileURLToPath(skraftUrl),
  launcherSource: fileURLToPath(new URL('launcher.mjs', skraftUrl)),
  setWindowsUserPath: windowsUserPathWriter(),
})
