import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

// The folder reaches PowerShell through the environment, a value no shell interpolates.
//
// The raw user PATH is read with DoNotExpandEnvironmentNames: GetEnvironmentVariable would return
// it expanded and writing that back would freeze `%USERPROFILE%\bin` into a literal. It is written
// back as ExpandString (REG_EXPAND_SZ) so the `%VAR%` entries stay variables.
//
// A registry write does not tell running programs. Windows only re-reads the environment after a
// WM_SETTINGCHANGE broadcast with lParam "Environment", which is what SetEnvironmentVariable does
// internally and what the shell does after the Environment dialog: SendMessageTimeout to
// HWND_BROADCAST (0xffff), message 0x1A, SMTO_ABORTIFHUNG (2), 5000 ms, so a hung window cannot
// block the install. The broadcast is best effort: the PATH is already written when it fails.
// The C# signature holds double quotes, so the script travels as -EncodedCommand, which no
// command-line quoting can alter.
const ADD_TO_USER_PATH = [
  '$bin = $env:SKRAFT_BIN_DIR',
  "$user = [string](Get-Item 'HKCU:\\Environment').GetValue('Path', '', 'DoNotExpandEnvironmentNames')",
  "if (($user -split ';') -contains $bin) { Write-Output 'present'; exit 0 }",
  "$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)",
  "$key.SetValue('Path', ($user.TrimEnd(';') + ';' + $bin).TrimStart(';'), [Microsoft.Win32.RegistryValueKind]::ExpandString)",
  '$key.Close()',
  'try {',
  `Add-Type -Namespace Skraft -Name Native -MemberDefinition '[DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);'`,
  "$result = [UIntPtr]::Zero; [void][Skraft.Native]::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$result)",
  '} catch { }',
  "Write-Output 'added'",
].join('\n')

const SCRIPT = Buffer.from(ADD_TO_USER_PATH, 'utf16le').toString('base64')

/**
 * Adds a folder to the user PATH through PowerShell (never setx, which cuts at 1024 characters).
 * @param {typeof spawnSync} [spawn]
 * @returns {(binDir: string) => 'added' | 'present' | 'failed'}
 */
export const windowsUserPathWriter = (spawn = spawnSync) => (binDir) => {
  const run = spawn('powershell', ['-NoProfile', '-EncodedCommand', SCRIPT], { env: { ...process.env, SKRAFT_BIN_DIR: binDir }, encoding: 'utf8', windowsHide: true })
  const printed = String(run.stdout ?? '').trim()
  return run.status === 0 && (printed === 'added' || printed === 'present') ? printed : 'failed'
}

/** The real host of `skraft install`. @param {string} skraftUrl import.meta.url of skraft.mjs @returns {import('./install.mjs').InstallHost} */
export const nodeInstallHost = (skraftUrl) => ({
  home: homedir(),
  env: process.env,
  platform: process.platform,
  skraftPath: fileURLToPath(skraftUrl),
  launcherSource: fileURLToPath(new URL('launcher.mjs', skraftUrl)),
  setWindowsUserPath: windowsUserPathWriter(),
})
