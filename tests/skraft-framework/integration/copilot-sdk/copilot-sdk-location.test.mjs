import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createCopilotSdkLocator } from '../../../../plugins/skraft-framework/engine/infrastructure/copilot/copilot-sdk-locator.mjs'
import { createNodeAdapters } from '../../../../plugins/skraft-framework/engine/infrastructure/node-adapters.mjs'
import { PLUGIN_ROOT, skraft, tempFolder } from '../support/workspace.mjs'

const HERE = `${process.platform}-${process.arch}`

/** A Copilot CLI package folder; `parts` says which of the SDK and the CLI entry it holds. */
const pkg = (home, platform, version, parts = ['sdk', 'cli']) => {
  const dir = join(home, '.copilot', 'pkg', platform, version)
  mkdirSync(join(dir, 'copilot-sdk'), { recursive: true })
  if (parts.includes('sdk')) writeFileSync(join(dir, 'copilot-sdk', 'index.js'), 'export {}\n')
  if (parts.includes('cli')) writeFileSync(join(dir, 'index.js'), '\n')
  return dir
}

const locate = (home, platform = 'darwin-arm64') => createCopilotSdkLocator({ home, platform }).locate()
const at = (dir, version) => ({ found: true, version, sdk: join(dir, 'copilot-sdk'), cli: join(dir, 'index.js') })

test('the newest version, in semantic order, of this platform that ships both the SDK and the CLI entry is the one the VS Code driver runs on', async (t) => {
  const home = tempFolder(t)
  pkg(home, 'darwin-arm64', '1.0.9')
  pkg(home, 'darwin-arm64', '1.0.102-1')
  const chosen = pkg(home, 'darwin-arm64', '1.0.102')
  pkg(home, 'darwin-arm64', '1.0.110', ['cli'])
  pkg(home, 'darwin-arm64', '1.0.111', ['sdk'])
  pkg(home, 'linux-x64', '2.0.0')
  pkg(home, 'universal', '3.0.0')
  writeFileSync(join(home, '.copilot', 'pkg', 'darwin-arm64', 'notes.txt'), '')

  assert.deepEqual(await locate(home), at(chosen, '1.0.102'))
})

test('prereleases sort below their release and by their identifiers, numbers by value and below words', async (t) => {
  const newest = async (versions) => {
    const home = tempFolder(t)
    for (const version of versions) pkg(home, 'darwin-arm64', version)
    return (await locate(home)).version
  }

  assert.equal(await newest(['1.0.102-1', '1.0.102-0', '1.0.101']), '1.0.102-1')
  assert.equal(await newest(['1.0.102-0', '1.0.102-1', '1.0.101']), '1.0.102-1')
  assert.equal(await newest(['1.0.102-2', '1.0.102-10']), '1.0.102-10')
  assert.equal(await newest(['1.0.102-10', '1.0.102-beta']), '1.0.102-beta')
  assert.equal(await newest(['1.0.102-beta', '1.0.102-10']), '1.0.102-beta')
  assert.equal(await newest(['1.0.102-alpha', '1.0.102-beta']), '1.0.102-beta')
  assert.equal(await newest(['1.0.102-alpha', '1.0.102-Beta']), '1.0.102-Beta')
  assert.equal(await newest(['1.0.102-beta', '1.0.102-beta.2']), '1.0.102-beta.2')
  assert.equal(await newest(['1.2', '1.2.1', '1.10']), '1.10')
  assert.equal(await newest(['1.2.1', '1.2']), '1.2.1')
  assert.equal(await newest(['2.0.0-1', '1.9.9']), '2.0.0-1')
})

test('without the Copilot CLI packages of this platform there is no SDK, a folder that cannot be read holds none, and doctor names the folder it searched', async (t) => {
  const home = tempFolder(t)
  const looked = { found: false, looked: join(home, '.copilot', 'pkg') }
  assert.deepEqual(await locate(home), looked)
  pkg(home, 'darwin-arm64', '1.0.50', ['cli'])
  pkg(home, 'linux-x64', '1.0.51')
  assert.deepEqual(await locate(home), looked)
  writeFileSync(join(home, '.copilot', 'pkg', 'win32-x64'), 'a file, not a folder')
  assert.deepEqual(await locate(home, 'win32-x64'), looked)
  if (process.platform !== 'win32' && process.getuid?.() !== 0) {
    const sealed = join(pkg(home, 'freebsd-x64', '1.0.1'), '..')
    chmodSync(sealed, 0o000)
    const sealedLocation = await locate(home, 'freebsd-x64')
    chmodSync(sealed, 0o755)
    assert.deepEqual(sealedLocation, looked)
  }

  const doctor = await skraft(tempFolder(t), ['doctor'], { home })

  assert.ok(doctor.stdout.includes(`ok    vscode: no Copilot SDK under ${join(home, '.copilot', 'pkg')}: under VS Code, the Skraft - Orchestrator agent conducts skraft next and skraft record`), doctor.stdout)
})

test('the adapters look in this machine\'s platform folder of the home they are given', async (t) => {
  const home = tempFolder(t)
  const chosen = pkg(home, HERE, '1.0.7')

  assert.deepEqual(await createNodeAdapters({ cwd: home, pluginRoot: PLUGIN_ROOT, home }).copilotSdk.locate(), at(chosen, '1.0.7'))
})
