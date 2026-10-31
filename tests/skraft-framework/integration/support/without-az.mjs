// A PATH on which az is not installed, for the length of a test. These tests start a run on an
// Azure DevOps remote: whatever the machine has installed, none may reach an organization.
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { createNodeExecutables } from '../../../../plugins/skraft-framework/engine/infrastructure/process/node-processes.mjs'
import { tempFolder } from './workspace.mjs'

const AZ_NAMES = ['az', 'az.cmd', 'az.bat', 'az.exe']

/**
 * Throws when an `az` resolves on that environment's PATH, through the lookup the command runner
 * uses: a test that fell back to az would then call a real organization.
 * @param {NodeJS.ProcessEnv} env @param {string} root a folder to resolve from
 */
export const assertNoAz = async (env, root) => {
  const found = await createNodeExecutables({ root, env }).locate('az', '.')
  if (found !== null) throw new Error(`az resolves to ${found} on the PATH of this test: it would reach a real Azure DevOps organization`)
}

const gitPath = () => spawnSync(process.platform === 'win32' ? 'where' : 'which', ['git'], { encoding: 'utf8' }).stdout.split(/\r?\n/)[0].trim()

/**
 * Windows starts a command without a shell only from an .exe or a .com, so a .cmd shim is never
 * found there: the folders of git and node go on the PATH, each refused when az sits beside it.
 */
const windowsFolders = (git, execPath) => [dirname(git), dirname(execPath)].map((folder) => {
  if (AZ_NAMES.some((name) => existsSync(join(folder, name)))) throw new Error(`az sits beside a program of the test PATH in ${folder}`)
  return folder
})

/** A shim of git and a shim of node: the only programs of the PATH, never the folders they live in (which may hold az). */
const shimFolder = (dir, git, execPath) => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'git'), `#!/bin/sh\nexec "${git}" "$@"\n`)
  chmodSync(join(dir, 'git'), 0o755)
  symlinkSync(execPath, join(dir, 'node'))
  return [dir]
}

/**
 * Puts a PATH of git and node alone, with no az, in this process's environment until the test ends.
 * @param {import('node:test').TestContext} t @param {{ execPath?: string }} [options] execPath: the node to shim, this process's by default
 */
export const withoutAz = async (t, { execPath = process.execPath } = {}) => {
  const git = gitPath()
  const dir = join(tempFolder(t, 'skraft-no-az-'), 'git-and-node')
  const folders = process.platform === 'win32' ? windowsFolders(git, execPath) : shimFolder(dir, git, execPath)
  const path = process.env.PATH
  t.after(() => { process.env.PATH = path })
  process.env.PATH = folders.join(delimiter)
  await assertNoAz(process.env, folders[0])
}
