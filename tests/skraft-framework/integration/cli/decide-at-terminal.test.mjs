import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { terminalConfirm } from '../../../../plugins/skraft-framework/engine/drivers/cli/terminal-confirm.mjs'
import { SLUG, pipelineRepository, scriptedLlm } from '../support/pipeline-repository.mjs'
import { SKRAFT_MJS, journal, skraft, tempFolder } from '../support/workspace.mjs'
import { loop, startAgents } from '../agent-loop/simulated-conductor.mjs'

/** A repository whose run waits on the ratification of its ADR, reached through the agent loop. */
const waitingOnRatification = async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  const llm = scriptedLlm({ cwd })
  let { step } = await loop(cwd, ['next'])
  while (step.status === 'dispatch') {
    startAgents(step, llm)
    ;({ step } = await loop(cwd, ['record']))
  }
  return cwd
}

const answers = (cwd) => journal(cwd, SLUG).filter((event) => event.type === 'question.answered').map(({ key, answer, by }) => [key, answer, by])

test('skraft decide records an answer only once the person confirms it at their terminal, journaled by cli-tty', async (t) => {
  const cwd = await waitingOnRatification(t)
  const asked = []
  const person = (yes) => async (question) => { asked.push(question); return yes }

  const declined = await skraft(cwd, ['decide', 'RATIFIED'], { confirm: person(false) })
  const unattended = await skraft(cwd, ['decide', 'adr-1', 'RATIFIED'], { confirm: async () => null })

  assert.deepEqual(declined, { status: 1, stdout: '', stderr: 'not confirmed; nothing was recorded\n' })
  assert.deepEqual(unattended, { status: 1, stdout: '', stderr: "skraft decide records a person's answer: run it yourself in an interactive terminal; nothing was recorded\n" })
  assert.deepEqual(answers(cwd), [])
  const confirmed = await skraft(cwd, ['decide', 'adr-1', 'REJECTED', '--reason', 'use the bank gateway'], { confirm: person(true) })
  assert.equal(confirmed.status, 0, confirmed.stderr)
  assert.deepEqual(asked, ['skraft decide: record RATIFIED for adr-1? [y/N] ', 'skraft decide: record REJECTED for adr-1? [y/N] '])
  assert.deepEqual(answers(cwd), [['adr-1', 'REJECTED', 'cli-tty']])
})

test('started as a program with no terminal to type in, skraft decide records nothing', async (t) => {
  const cwd = await waitingOnRatification(t)

  const run = spawnSync(process.execPath, [SKRAFT_MJS, 'decide', 'RATIFIED'], { cwd, encoding: 'utf8', input: 'y\n', env: { ...process.env, HOME: `${cwd}-home`, USERPROFILE: `${cwd}-home` } })

  assert.deepEqual({ status: run.status, stderr: run.stderr }, { status: 1, stderr: "skraft decide records a person's answer: run it yourself in an interactive terminal; nothing was recorded\n" })
  assert.deepEqual(answers(cwd), [])
})

test('the terminal asks on its output and takes y or yes, in any case, as a yes; anything else is a no', async () => {
  const confirmOn = async (typed) => {
    const input = Object.assign(new PassThrough(), { isTTY: true })
    const output = new PassThrough()
    const confirmed = terminalConfirm({ input, output })('record? ')
    input.write(`${typed}\n`)
    return [await confirmed, output.read()?.toString()]
  }

  assert.deepEqual(await confirmOn(' Yes '), [true, 'record? '])
  assert.deepEqual([(await confirmOn('y'))[0], (await confirmOn('Y'))[0], (await confirmOn('yess'))[0], (await confirmOn('ay'))[0], (await confirmOn(''))[0]], [true, true, false, false, false])
})
