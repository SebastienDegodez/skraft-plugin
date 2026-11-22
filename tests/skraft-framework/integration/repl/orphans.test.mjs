import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { createOrphanJournal } from '../../../../plugins/skraft-framework/engine/infrastructure/repl/orphans.mjs'
import { tempFolder } from '../support/workspace.mjs'

// Real processes: whether the server that holds a lease or left programs behind is gone.

/** The pid of a process that has run and ended. */
const endedPid = () => spawnSync(process.execPath, ['-e', 'process.exit(0)']).pid

test('a process is gone when none runs under its pid, read without the system tool that gives start times; one that runs is never gone while its start time cannot be read', async (t) => {
  const unreadable = createOrphanJournal({ folder: join(tempFolder(t), 'skraft-repl'), creationOf: () => null })
  const readable = createOrphanJournal({ folder: join(tempFolder(t), 'skraft-repl'), creationOf: () => 'started now' })

  assert.equal(await unreadable.gone({ pid: endedPid(), created: 'then' }), true)
  assert.equal(await unreadable.gone({ pid: process.pid, created: 'another time' }), false)
  assert.equal(await readable.gone({ pid: process.pid, created: 'another time' }), true, 'a pid the system reused for another process')
  assert.equal(await readable.gone({ pid: process.pid, created: 'started now' }), false)
})
