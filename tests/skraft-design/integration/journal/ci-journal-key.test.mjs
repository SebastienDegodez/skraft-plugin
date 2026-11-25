import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createNodeAdapters } from '../../../../plugins/skraft-design/engine/infrastructure/node-adapters.mjs'

const SECRET = 'ab'.repeat(32)

/** Two runners: the job that pauses a CI run and the job that resumes it, each with its own empty HOME. */
const runners = async (t, env) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'skraft design key ')))
  t.after(() => rm(root, { recursive: true, force: true }))
  const runner = (name) => createNodeAdapters({ cwd: join(root, 'work'), pluginRoot: join(root, 'plugin'), home: join(root, name), env })
  return { pausing: runner('home-1'), resuming: runner('home-2') }
}

test('with the repository secret, the job that resumes a CI run reads the key the pausing job signed with', async (t) => {
  const { pausing, resuming } = await runners(t, { SKRAFT_DESIGN_JOURNAL_KEY: SECRET })
  const created = await pausing.journalKeys.create()
  assert.equal(created.key, SECRET)
  assert.equal(await resuming.journalKeys.read(created.id), SECRET)
})

test('without the secret each runner keeps its own key, and a secret that is not 64 hex characters is refused', async (t) => {
  const { pausing, resuming } = await runners(t, {})
  const created = await pausing.journalKeys.create()
  assert.equal(await resuming.journalKeys.read(created.id), null)
  const broken = await runners(t, { SKRAFT_DESIGN_JOURNAL_KEY: 'not-a-key' })
  await assert.rejects(broken.pausing.journalKeys.create(), /SKRAFT_DESIGN_JOURNAL_KEY must be 64 hexadecimal characters/)
})
