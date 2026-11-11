import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInit } from '../../../../plugins/skraft-framework/engine/application/pipeline/init-usecase.mjs'
import { openJournal } from '../../../../plugins/skraft-framework/engine/application/journal/run-journal.mjs'
import { inProcessServices, journal } from '../support/workspace.mjs'
import { pipelineRepository, SLUG } from '../support/pipeline-repository.mjs'
import { mcpHost } from './mcp-host.mjs'

const waiting = async (cwd, kind = 'adr-ratification') => {
  const adapters = inProcessServices(cwd).adapters()
  await createInit(adapters).init({ slug: SLUG })
  const opened = await openJournal(adapters, SLUG)
  await opened.journal.append('question.asked', {
    key: 'native-1', kind, text: 'Ratify the payment design?',
    options: kind === 'blocked' ? ['STOP'] : ['RATIFIED', 'REJECTED'],
    refusals: kind === 'blocked' ? [] : ['REJECTED'], header: 'Design', step: 'design', visit: 1, subjects: [],
  })
}

test('native answer records in the selected workspace without terminal consent, preserving refusal reason and rejecting stale or duplicate keys', async (t) => {
  const { cwd } = pipelineRepository(t)
  const { cwd: other } = pipelineRepository(t)
  await waiting(cwd)
  await waiting(other)
  const before = journal(other, SLUG)
  const host = mcpHost({ roots: [other, cwd], client: 'GitHub Copilot CLI' })
  t.after(() => host.close())
  await host.initialize()
  const args = { workspace: cwd, key: 'native-1', answer: 'REJECTED', reason: '- Use the bank gateway' }
  const reply = await host.call('skraft_answer', args)
  assert.equal(reply.isError, false, 'native answer must be recorded without terminal consent')
  const result = JSON.parse(reply.content[0].text)
  assert.equal(result.ok, true)
  assert.deepEqual(journal(cwd, SLUG).filter(({ type }) => type === 'question.answered').map(({ key, answer, reason, by }) => ({ key, answer, reason, by })), [
    { key: 'native-1', answer: 'REJECTED', reason: '- Use the bank gateway', by: 'decide' },
  ])
  assert.deepEqual(journal(other, SLUG), before)
  assert.equal((await host.json('skraft_answer', args)).code, 'already-answered')
  assert.equal((await host.json('skraft_answer', { ...args, key: 'stale-1' })).code, 'no-question')
  assert.equal(host.log.length, 0)
})

test('invalid or partial native replies write nothing; instruction text beginning with a hyphen is data, not argv', async (t) => {
  const { cwd } = pipelineRepository(t)
  await waiting(cwd, 'blocked')
  const host = mcpHost({ workingDirectory: cwd })
  t.after(() => host.close())
  await host.initialize()
  for (const args of [
    {}, { key: 'native-1' }, { answer: 'STOP' }, { key: null, answer: 'STOP' },
    { key: '-native', answer: 'STOP' }, { key: 'native-1', answer: 'STOP', unknown: 'SECRET' },
    { key: 'native-1', answer: '' }, { key: 'native-1', answer: ' ' },
    { key: 'native-1', answer: 'STOP', reason: null }, { key: 'native-1', answer: 'STOP', reason: ' ' },
  ]) assert.equal((await host.call('skraft_answer', args)).isError, true)
  assert.equal(journal(cwd, SLUG).filter(({ type }) => type === 'question.answered').length, 0)
  const outcome = await host.json('skraft_answer', { key: 'native-1', answer: '- Keep the bank gateway' })
  assert.equal(outcome.ok, true)
  assert.deepEqual(journal(cwd, SLUG).filter(({ type }) => type === 'question.answered').map(({ answer, by }) => [answer, by]), [['- Keep the bank gateway', 'decide']])
})
