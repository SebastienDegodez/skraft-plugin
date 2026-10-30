// A PATH on which az is not installed, for the length of a test. These tests start a run on an
// Azure DevOps remote: whatever the machine has installed, none may reach an organization.
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, delimiter, join } from 'node:path'
import { tempFolder } from './workspace.mjs'

/**
 * Puts a PATH of git and node alone in this process's environment until the test ends.
 * @param {import('node:test').TestContext} t
 */
export const withoutAz = (t) => {
  const real = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['git'], { encoding: 'utf8' }).stdout.split(/\r?\n/)[0].trim()
  const bin = join(tempFolder(t, 'skraft-no-az-'), 'git-only')
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, 'git.cmd'), `@"${real}" %*\r\n`)
  writeFileSync(join(bin, 'git'), `#!/bin/sh\nexec "${real}" "$@"\n`)
  chmodSync(join(bin, 'git'), 0o755)
  const path = process.env.PATH
  process.env.PATH = [bin, dirname(process.execPath)].join(delimiter)
  t.after(() => { process.env.PATH = path })
}
