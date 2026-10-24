import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createNodeAdapters } from '../../../../plugins/skraft-framework/engine/infrastructure/node-adapters.mjs'
import { PLUGIN_ROOT, skraft, tempFolder } from '../support/workspace.mjs'

/** A Copilot CLI package folder; `parts` says which of the SDK and the CLI entry it holds. */
const pkg = (home, platform, version, parts = ['sdk', 'cli']) => {
  const dir = join(home, '.copilot', 'pkg', platform, version)
  mkdirSync(join(dir, 'copilot-sdk'), { recursive: true })
  if (parts.includes('sdk')) writeFileSync(join(dir, 'copilot-sdk', 'index.js'), 'export {}\n')
  if (parts.includes('cli')) writeFileSync(join(dir, 'index.js'), '\n')
  return dir
}

const locate = (home) => createNodeAdapters({ cwd: home, pluginRoot: PLUGIN_ROOT, home }).copilotSdk.locate()

test('the newest version that ships both the SDK and the CLI entry is the one the VS Code driver runs on', async (t) => {
  const home = tempFolder(t)
  pkg(home, 'darwin-arm64', '1.0.9')
  const chosen = pkg(home, 'darwin-arm64', '1.0.102-1')
  pkg(home, 'universal', '1.0.110', ['cli'])
  pkg(home, 'universal', '1.0.111', ['sdk'])
  writeFileSync(join(home, '.copilot', 'pkg', 'tmp'), '')

  assert.deepEqual(await locate(home), { found: true, version: '1.0.102-1', sdk: join(chosen, 'copilot-sdk'), cli: join(chosen, 'index.js') })
})

test('without the Copilot CLI packages there is no SDK, and doctor names the folder it searched and the agent loop', async (t) => {
  const home = tempFolder(t)
  assert.deepEqual(await locate(home), { found: false, looked: join(home, '.copilot', 'pkg') })
  pkg(home, 'linux-x64', '1.0.50', ['cli'])
  assert.deepEqual(await locate(home), { found: false, looked: join(home, '.copilot', 'pkg') })

  const doctor = await skraft(tempFolder(t), ['doctor'], { home })

  assert.ok(doctor.stdout.includes(`ok    vscode: no Copilot SDK under ${join(home, '.copilot', 'pkg')}: under VS Code, the Skraft - Orchestrator agent conducts skraft next and skraft record`), doctor.stdout)
})
