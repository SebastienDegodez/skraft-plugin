import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { register } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/register.mjs'
import { PLUGIN_ROOT, workingCopy } from './simulated-host.mjs'
import { registered, simulatedSdk } from './simulated-sdk.mjs'

/** Every .mjs file under a folder, node_modules left out. */
const sourcesUnder = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true })
  const paths = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.mjs')).map((entry) => join(entry.parentPath, entry.name)).filter((path) => !path.split(sep).includes('node_modules'))
  return Promise.all(paths.map(async (path) => ({ path, source: await readFile(path, 'utf8') })))
}

const BOTH = { workflows: ['skraft-pipeline'], tools: ['skraft_decide'] }

const registerOn = async (t, sdk) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  return register({ defineWorkflow: sdk.defineWorkflow, joinSession: sdk.joinSession, cwd, pluginRoot: PLUGIN_ROOT, home: `${cwd}-home` })
}

test('the workflow and the tool join the session together, and nothing is logged', async (t) => {
  const sdk = simulatedSdk()

  const session = await registerOn(t, sdk)

  assert.equal(session, sdk.session)
  assert.deepEqual(registered(sdk.joins), [BOTH])
  assert.deepEqual(sdk.logs, [])
})

test('a workflow definition the SDK rejects leaves the tool registered, and the session log says the workflow is missing', async (t) => {
  const sdk = simulatedSdk({ defineFails: true })

  await registerOn(t, sdk)

  assert.deepEqual(registered(sdk.joins), [{ workflows: [], tools: ['skraft_decide'] }])
  assert.deepEqual(sdk.logs, [{ level: 'error', message: 'skraft: the skraft-pipeline workflow could not be defined; it is not available in this session.' }])
})

test('a join the host refuses is joined again without the tool; the workflow stays and the session log says the tool is missing', async (t) => {
  const sdk = simulatedSdk({ refuseTools: true })

  const session = await registerOn(t, sdk)

  assert.equal(session, sdk.session)
  assert.deepEqual(registered(sdk.joins), [BOTH, { workflows: ['skraft-pipeline'], tools: [] }])
  assert.deepEqual(sdk.logs, [{ level: 'error', message: 'skraft: the host refused the skraft_decide tool; answer a skraft question with skraft decide in a terminal.' }])
})

test('a host that refuses every join leaves no session and does not throw', async (t) => {
  const sdk = simulatedSdk({ refuseAll: true })

  assert.equal(await registerOn(t, sdk), null)
  assert.deepEqual(registered(sdk.joins), [BOTH, { workflows: ['skraft-pipeline'], tools: [] }])
})

test('a session whose log fails does not make the registration throw', async (t) => {
  const sdk = simulatedSdk({ defineFails: true })
  sdk.session.log = async () => { throw new Error('log is closed') }

  assert.equal(await registerOn(t, sdk), sdk.session)
})

test('only the extension entry imports the Copilot SDK, and it hands it to register', async () => {
  const importers = (await sourcesUnder(PLUGIN_ROOT)).filter(({ source }) => source.includes('@github/copilot-sdk')).map(({ path }) => relative(PLUGIN_ROOT, path).split(sep).join('/'))

  assert.deepEqual(importers, ['com.github.copilot/extensions/skraft-pipeline/extension.mjs'])
  assert.match(await readFile(join(PLUGIN_ROOT, importers[0]), 'utf8'), /await register\(\{ defineWorkflow, joinSession,/)
})
