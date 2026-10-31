// A PATH on which az is not installed, for the length of a test. These tests start a run on an
// Azure DevOps remote: whatever the machine has installed, none may reach an organization.
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, delimiter, join } from 'node:path'
import { tempFolder } from './workspace.mjs'

/**
 * Puts a PATH of git and node alone in this process's environment until the test ends.
 * @param {import('node:test').TestContext} t
 */
export const withoutAz = (t) => {
  const real = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['git'], { encoding: 'utf8' }).stdout.split(/\r?\n/)[0].trim()
  const path = process.env.PATH
  process.env.PATH = [gitFolder(t, real), dirname(process.execPath)].join(delimiter)
  t.after(() => { process.env.PATH = path })
}

/**
 * A folder that runs git and nothing else on this machine. Windows starts a command without a
 * shell only from an .exe or a .com, so a git.cmd wrapper is never found there: git's own folder
 * goes on the PATH, refused when az sits beside it.
 * @param {import('node:test').TestContext} t @param {string} real the git the machine runs
 */
const gitFolder = (t, real) => {
  if (process.platform === 'win32') {
    const folder = dirname(real)
    if (['az', 'az.cmd', 'az.bat', 'az.exe'].some((name) => existsSync(join(folder, name)))) throw new Error(`az sits beside git in ${folder}`)
    return folder
  }
  const bin = join(tempFolder(t, 'skraft-no-az-'), 'git-only')
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, 'git'), `#!/bin/sh\nexec "${real}" "$@"\n`)
  chmodSync(join(bin, 'git'), 0o755)
  return bin
}
