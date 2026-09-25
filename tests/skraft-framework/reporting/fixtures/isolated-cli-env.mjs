import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join, delimiter } from 'node:path'

const windows = process.platform === 'win32'

// Absolute git binary: POSIX keeps the system git; Windows resolves the runner's git.exe.
export const gitExecutable = windows
  ? spawnSync('where.exe', ['git'], { encoding: 'utf8' }).stdout.split(/\r?\n/).find(Boolean)
  : '/usr/bin/git'

// Installs a sentinel `gh` running `source` under node, and returns how to invoke it directly.
// Windows cannot execute a shebang script, so PATH resolution goes through a gh.cmd shim.
export function installGhSentinel(bin, source) {
  if (!windows) {
    const path = join(bin, 'gh')
    writeFileSync(path, `#!${process.execPath}\n${source}`, { mode: 0o755 })
    return { file: path, args: [] }
  }
  const script = join(bin, 'gh.js')
  writeFileSync(script, source)
  writeFileSync(join(bin, 'gh.cmd'), `@"${process.execPath}" "%~dp0gh.js" %*\r\n`)
  return { file: process.execPath, args: [script] }
}

// Minimal environment isolating HOME, TMP and git config; Windows also needs its system variables.
export function isolatedEnv({ bin, home, temp, extra = {} }) {
  const path = [bin, dirname(process.execPath), ...(windows ? [dirname(gitExecutable)] : ['/usr/bin', '/bin'])]
  return {
    PATH: path.join(delimiter),
    HOME: home, TMPDIR: temp, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    ...(windows ? {
      SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec, PATHEXT: process.env.PATHEXT,
      TEMP: temp, TMP: temp, USERPROFILE: home,
    } : {}),
    ...extra,
  }
}
