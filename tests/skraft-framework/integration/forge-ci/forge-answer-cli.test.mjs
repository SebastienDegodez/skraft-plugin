import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runCli } from '../../../../plugins/skraft-framework/engine/drivers/cli/run-cli.mjs'
import { agent, scripted, SLUG } from '../../unit/support/pipeline-host.mjs'
import { ADR_1, adrText, afterDesign, architect, eventsOf } from '../../unit/support/decisions.mjs'

const proposed = (it) => [agent()(it), architect({ [ADR_1]: adrText() })(it), ...afterDesign(it)]

/** CliServices wired on a pipelineHost: enough for commands that go through adapters and Decide. */
const servicesOf = (host) => ({ adapters: () => host.deps, pluginVersion: () => '2.0.0-test', workingCopyName: () => '/work', command: () => 'node skraft.mjs', confirm: async () => true })

const consoleOf = () => {
  const out = [], err = []
  return { out, err, console: { out: (/** @type {string} */ line) => out.push(line), err: (/** @type {string} */ line) => err.push(line) } }
}

const postedAnswer = (host, body, login = 'alice') => host.codeHost.comments.push({ number: 42, login, body, bodies: [body], edits: 0, url: `https://x/issues/42#issuecomment-${host.codeHost.comments.length + 900}`, bodyFile: '' })

test('skraft forge answer --issue <n> relays the /skraft-answer reply from the issue\'s comments to Decide on the active pipeline, journaled by forge-comment', async () => {
  const host = scripted({}, proposed)
  await host.start()
  postedAnswer(host, '/skraft-answer adr-1 RATIFIED')
  const { console, out, err } = consoleOf()

  const exit = await runCli(['forge', 'answer', '--issue', '42'], servicesOf(host), console)

  assert.equal(exit, 0, err.join('\n'))
  assert.deepEqual(eventsOf(host, 'question.answered').map(({ key, answer, by }) => [key, answer, by]), [['adr-1', 'RATIFIED', 'forge-comment']])
  assert.match(out.at(-1), /adr-1/)
})

test('skraft forge answer refuses without --issue and without a /skraft-answer line among the comments, with nothing recorded either way', async () => {
  const host = scripted({}, proposed)
  await host.start()
  const { console, err } = consoleOf()

  const noIssue = await runCli(['forge', 'answer'], servicesOf(host), console)
  assert.equal(noIssue, 2, 'no --issue is a usage error')
  const bad = await runCli(['forge', 'answer', '--issue', 'nope'], servicesOf(host), console)
  assert.equal(bad, 2, 'a non-numeric --issue is a usage error')
  const noAnswer = await runCli(['forge', 'answer', '--issue', '42'], servicesOf(host), console)
  assert.equal(noAnswer, 1)
  assert.ok(err.some((line) => line.includes(`no /skraft-answer line on issue #42; nothing was recorded`)), err.join('\n'))
  assert.deepEqual(eventsOf(host, 'question.answered'), [])
})
