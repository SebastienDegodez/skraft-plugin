import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SLUG, pipelineRepository } from '../support/pipeline-repository.mjs'
import { tokenLineOf } from '../agent-loop/simulated-conductor.mjs'
import { NUMBER, pullRequestRepository, reviewLlm } from '../support/pull-request-repository.mjs'
import { SKRAFT_MJS, journal, skraft, tempFolder } from '../support/workspace.mjs'

const UNVERIFIABLE = 'journal unverifiable: the key that signed events.jsonl is not in ~/.skraft/journal-keys on this machine (unverified: line 1: 1 run.started); restore it from the machine that started the run, or adopt the journal on this machine with skraft journal adopt, typed in your own terminal (its earlier lines stay unverified)'

/** A run started on another machine (another home folder, its own journal keys). */
const startedElsewhere = async (t) => {
  const { cwd } = pipelineRepository(t)
  assert.equal((await skraft(cwd, ['init', SLUG], { home: tempFolder(t) })).status, 0)
  return cwd
}

test('skraft journal adopt signs a journal from another machine with a key of this one, once the person confirms at their terminal', async (t) => {
  const cwd = await startedElsewhere(t)
  const home = tempFolder(t)
  const asked = []
  const person = (yes) => async (question) => { asked.push(question); return yes }
  assert.deepEqual((await skraft(cwd, ['status'], { home })).stdout.split('\n').at(-2), UNVERIFIABLE)

  const declined = await skraft(cwd, ['journal', 'adopt'], { home, confirm: person(false) })
  const unattended = await skraft(cwd, ['journal', 'adopt'], { home, confirm: async () => null })
  assert.deepEqual(declined, { status: 1, stdout: '', stderr: 'not confirmed; nothing was adopted\n' })
  assert.deepEqual(unattended, { status: 1, stdout: '', stderr: 'skraft journal adopt takes a person\'s yes: run it yourself in an interactive terminal; nothing was adopted\n' })
  assert.equal(journal(cwd, SLUG).length, 1)

  const adopted = await skraft(cwd, ['journal', 'adopt'], { home, confirm: person(true) })

  assert.deepEqual(adopted, { status: 0, stdout: `${SLUG}: journal adopted with a new key of this machine; its 1 earlier lines stay unverified\n`, stderr: '' })
  const question = `skraft journal adopt: sign the journal of ${SLUG} on from here with a key of this machine, leaving unverified line 1: 1 run.started? [y/N] `
  assert.deepEqual(asked, [question, question])
  assert.deepEqual(journal(cwd, SLUG).map((event) => event.type), ['run.started', 'journal.adopted'])
  assert.equal((await skraft(cwd, ['status'], { home })).status, 0)
  assert.deepEqual(await skraft(cwd, ['journal', 'adopt'], { home, confirm: person(true) }), { status: 1, stdout: '', stderr: `${SLUG}: this machine verifies every line of the journal; there is nothing to adopt\n` })
  assert.equal(asked.length, 2)
})

test('started as a program with no terminal to type in, skraft journal adopt adopts nothing', async (t) => {
  const cwd = await startedElsewhere(t)

  const run = spawnSync(process.execPath, [SKRAFT_MJS, 'journal', 'adopt'], { cwd, encoding: 'utf8', input: 'y\n', env: { ...process.env, HOME: `${cwd}-home`, USERPROFILE: `${cwd}-home` } })

  assert.deepEqual({ status: run.status, stderr: run.stderr }, { status: 1, stderr: 'skraft journal adopt takes a person\'s yes: run it yourself in an interactive terminal; nothing was adopted\n' })
  assert.equal(journal(cwd, SLUG).length, 1)
})

/** A review conducted on its own machine until it ends, each agent's reply written with its brief's token. */
const reviewedToTheEnd = async ({ cwd, env }) => {
  const llm = reviewLlm()
  let args = ['review', '--pr', String(NUMBER), '--json']
  for (let step = JSON.parse((await skraft(cwd, args, { env })).stdout); step.status === 'dispatch'; step = JSON.parse((await skraft(cwd, args, { env })).stdout)) {
    for (const { brief, reply } of step.dispatches) writeFileSync(reply, `${llm.act(readFileSync(brief, 'utf8'))}\n${tokenLineOf(readFileSync(brief, 'utf8'))}\n`)
    args = ['review', '--pr', String(NUMBER), '--record', '--json']
  }
}

test('skraft journal adopt --pr signs a pull request\'s review journal from another machine, once the person confirms at their terminal', async (t) => {
  const repo = pullRequestRepository(t)
  const review = ['review', '--pr', String(NUMBER), '--json']
  await reviewedToTheEnd(repo)
  const home = tempFolder(t)
  const events = () => readFileSync(join(repo.cwd, '.copilot-tracking', 'skraft-reviews', `pr-${NUMBER}`, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line).type)
  const before = events()
  const stopped = JSON.parse((await skraft(repo.cwd, review, { env: repo.env, home })).stdout)
  assert.deepEqual([stopped.status, stopped.code], ['stopped', 'journal-unverifiable'])
  const asked = []
  const person = (yes) => async (question) => { asked.push(question); return yes }

  const usage = await skraft(repo.cwd, ['journal', 'adopt', '--pr', 'twelve'], { env: repo.env, home, confirm: person(true) })
  const declined = await skraft(repo.cwd, ['journal', 'adopt', '--pr', String(NUMBER)], { env: repo.env, home, confirm: person(false) })
  const adopted = await skraft(repo.cwd, ['journal', 'adopt', '--pr', String(NUMBER)], { env: repo.env, home, confirm: person(true) })

  assert.equal(usage.status, 2)
  assert.deepEqual(declined, { status: 1, stdout: '', stderr: 'not confirmed; nothing was adopted\n' })
  assert.deepEqual(adopted, { status: 0, stdout: `pr-${NUMBER}: journal adopted with a new key of this machine; its ${before.length} earlier lines stay unverified\n`, stderr: '' })
  assert.equal(asked.length, 2)
  assert.match(asked[0], new RegExp(`^skraft journal adopt: sign the journal of pr-${NUMBER} on from here with a key of this machine, leaving unverified lines 1-${before.length}: `))
  assert.deepEqual(events(), [...before, 'journal.adopted'])
  assert.equal(JSON.parse((await skraft(repo.cwd, review, { env: repo.env, home })).stdout).status, 'NEEDS_REWORK')
})
