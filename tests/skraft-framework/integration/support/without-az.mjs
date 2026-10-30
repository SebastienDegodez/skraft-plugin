// A PATH on which az is not installed, for the length of a test. These tests start a run on an
// Azure DevOps remote: whatever the machine has installed, none may reach an organization.
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createNodeExecutables } from '../../../../plugins/skraft-framework/engine/infrastructure/process/node-processes.mjs'
import { tempFolder } from './workspace.mjs'

/**
 * Throws when an `az` resolves on that environment's PATH, through the lookup the command runner
 * uses: a test that fell back to az would then call a real organization.
 * @param {NodeJS.ProcessEnv} env @param {string} root a folder to resolve from
 */
export const assertNoAz = async (env, root) => {
  const found = await createNodeExecutables({ root, env }).locate('az', '.')
  if (found !== null) throw new Error(`az resolves to ${found} on the PATH of this test: it would reach a real Azure DevOps organization`)
}

/** A shim of git and a shim of node: the only programs of the PATH, never the folders they live in (which may hold az). */
const shims = (dir, execPath) => {
  const git = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['git'], { encoding: 'utf8' }).stdout.split(/\r?\n/)[0].trim()
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'git.cmd'), `@"${git}" %*\r\n`)
  writeFileSync(join(dir, 'node.cmd'), `@"${execPath}" %*\r\n`)
  writeFileSync(join(dir, 'git'), `#!/bin/sh\nexec "${git}" "$@"\n`)
  chmodSync(join(dir, 'git'), 0o755)
  if (process.platform !== 'win32') symlinkSync(execPath, join(dir, 'node'))
}

/**
 * Puts a PATH of a git shim and a node shim alone in this process's environment until the test ends.
 * @param {import('node:test').TestContext} t @param {{ execPath?: string }} [options] execPath: the node to shim, this process's by default
 */
export const withoutAz = async (t, { execPath = process.execPath } = {}) => {
  const bin = join(tempFolder(t, 'skraft-no-az-'), 'git-and-node')
  shims(bin, execPath)
  const path = process.env.PATH
  t.after(() => { process.env.PATH = path })
  process.env.PATH = bin
  await assertNoAz(process.env, bin)
}
