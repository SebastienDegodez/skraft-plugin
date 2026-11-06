import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SLUG, pipelineRepository, scriptedLlm } from '../support/pipeline-repository.mjs'
import { skraft, tempFolder } from '../support/workspace.mjs'
import { conduct } from '../agent-loop/simulated-conductor.mjs'

/** The lines printed, each time replaced by `<at>`. @param {string} stdout */
const timeless = (stdout) => stdout.split('\n').filter(Boolean).map((line) => line.replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/, '<at>'))

test('skraft journal show prints the state of the chain, then the last steps and decisions of the active pipeline, 20 unless told how many, with who confirmed each answer', async (t) => {
  const { cwd } = pipelineRepository(t)
  assert.deepEqual(await skraft(cwd, ['journal', 'show']), {
    status: 0, stderr: '',
    stdout: 'skraft: journal none\nno active pipeline in this working copy (.copilot-tracking/skraft-plans/.active-slug); start one with an explicit slug\n',
  })
  await skraft(cwd, ['init', SLUG])
  assert.deepEqual(await skraft(cwd, ['journal', 'show']), { status: 0, stderr: '', stdout: `skraft ${SLUG}: journal verified, 1 lines\n` })
  await conduct(cwd, scriptedLlm({ cwd }))

  const last = await skraft(cwd, ['journal', 'show', '--last', '3'])
  const all = timeless((await skraft(cwd, ['journal', 'show'])).stdout)
  const json = JSON.parse((await skraft(cwd, ['journal', 'show', '--last', '1', '--json'])).stdout)

  assert.deepEqual(timeless(last.stdout), [
    `skraft ${SLUG}: journal verified, 51 lines`,
    'last 3 of 14 entries',
    '44  <at>  visuals (DELIVER, pass 1, attempt 1): skipped → pr_writer',
    '47  <at>  pr_writer (PUBLISH, pass 1, attempt 1): done → publish',
    '49  <at>  publish (PUBLISH, pass 1, attempt 1): local → exit',
  ])
  assert.equal(last.status, 0)
  assert.equal(all.length, 15)
  assert.equal(all.find((line) => line.startsWith('14  ')), '14  <at>  adr-1: RATIFIED (by cli-tty)')
  assert.deepEqual({ ...json, entries: json.entries.map(({ at, ...entry }) => entry) }, {
    slug: SLUG, chain: { state: 'verified', lines: 51, unverified: 0, reason: '' }, total: 14,
    entries: [{ line: 49, kind: 'step', step: 'publish', phase: 'PUBLISH', pass: 1, attempt: 1, outcome: 'local', next: 'exit' }],
  })
})

test('skraft journal show exits 1 on a journal this machine cannot verify, and says why', async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG], { home: tempFolder(t) })

  const shown = await skraft(cwd, ['journal', 'show'], { home: tempFolder(t) })

  assert.equal(shown.status, 1)
  assert.deepEqual(shown.stdout.split('\n').slice(0, 1), [`skraft ${SLUG}: journal unverifiable`])
  assert.match(shown.stdout.split('\n')[1], /^journal unverifiable: the key that signed events\.jsonl is not in ~\/\.skraft\/journal-keys on this machine/)
})
