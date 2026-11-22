import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SLUG, pipelineRepository } from '../support/pipeline-repository.mjs'
import { skraft } from '../support/workspace.mjs'
import { toDeliveryAttempt } from './delivery-attempt.mjs'
import { mcpHost } from './mcp-host.mjs'

// A real server on a real repository: the pipeline is conducted to the attempt of its software
// engineer, which is left open, and the REPL runs real programs for it.
const BOUNDED = { timeout: 90_000 }
const NODE = JSON.stringify(process.execPath)

const textOf = (result) => result.content.map(({ text }) => text).join('\n')

test('skraft_repl is listed with a closed schema that takes the cell, even an empty one, and refuses any other argument without echoing it', BOUNDED, async (t) => {
  const { cwd } = pipelineRepository(t)
  const host = mcpHost({ roots: [cwd] })
  await host.initialize()

  const listed = (await host.request('tools/list')).result.tools.find(({ name }) => name === 'skraft_repl')
  const unknown = await host.call('skraft_repl', { code: '1', command: 'rm -rf secret-name' })
  const missing = await host.call('skraft_repl', {})
  const numeric = await host.call('skraft_repl', { code: 1 })

  assert.deepEqual([listed.inputSchema.required, listed.inputSchema.additionalProperties, Object.keys(listed.inputSchema.properties)], [['code'], false, ['code', 'workspace']])
  assert.deepEqual([unknown.isError, textOf(unknown)], [true, 'skraft_repl takes only these arguments: code, workspace'])
  assert.equal(textOf(missing), 'skraft_repl needs the argument code')
  assert.equal(textOf(numeric), 'the argument code of skraft_repl must be a text of at most 200000 characters')
  await host.close()
})

test('with no attempt open, skraft_repl is refused with a fixed text and starts nothing', BOUNDED, async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  const host = mcpHost({ roots: [cwd] })
  await host.initialize()

  const refused = await host.call('skraft_repl', { code: 'await run("echo no")' })

  assert.deepEqual([refused.isError, textOf(refused)], [true, 'repl-unavailable: skraft_repl works only inside the open attempt of an agent that commits code, and none is open now'])
  assert.equal(existsSync(join(cwd, '.copilot-tracking', 'skraft-repl')), false)
  await host.close()
})

test('in the attempt of the software engineer, a cell runs real programs, variables persist between calls, and closing the session ends the kernel and forgets its processes', BOUNDED, async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  await toDeliveryAttempt(cwd)
  const host = mcpHost({ roots: [cwd] })
  await host.initialize()

  const first = await host.call('skraft_repl', { code: `const test = await gate('test', [${NODE}, '-e', 'console.log("ok"); process.exit(2)'], { label: 'first' }); console.log('failed with', test.exitCode); test.output.trim()` })
  const second = await host.call('skraft_repl', { code: 'test.exitCode + 1' })

  assert.equal(first.isError, false)
  assert.match(textOf(first), /^failed with 2\nr1 exit 2 \(\d+\.\d s\) .* - logs\/runs\/deliver-1-1\/1\.log\n=> 'ok'$/)
  assert.equal(textOf(second), '=> 3')
  assert.equal(existsSync(join(cwd, '.copilot-tracking', 'skraft-repl')), true)
  await host.close()
})

test('two skraft_repl calls sent together share one kernel, the one the orphan journal names, and the second is told the first cell runs', BOUNDED, async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  await toDeliveryAttempt(cwd)
  const host = mcpHost({ roots: [cwd] })
  await host.initialize()
  t.after(() => host.close())
  const code = 'await new Promise((done) => setTimeout(done, 3000)); process.pid'

  const [first, second] = await Promise.all([host.call('skraft_repl', { code }), host.call('skraft_repl', { code })])
  const journal = JSON.parse(readFileSync(join(cwd, '.copilot-tracking', 'skraft-repl', `${process.pid}.json`), 'utf8'))

  assert.deepEqual([textOf(first), textOf(second).slice(0, 10)], [`=> ${journal.kernel.pid}`, 'repl-busy:'])
})

test('skraft_status answers while a cell runs, and a cancellation of the request ends the cell and the program it started', BOUNDED, async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  await toDeliveryAttempt(cwd)
  const host = mcpHost({ roots: [cwd] })
  await host.initialize()
  const requestId = 'repl-in-flight'
  host.write(JSON.stringify({ jsonrpc: '2.0', id: requestId, method: 'tools/call', params: { name: 'skraft_repl', arguments: { code: `await run([${NODE}, '-e', 'setInterval(() => {}, 1000)'])` } } }))

  const status = await host.call('skraft_status')
  const journal = join(cwd, '.copilot-tracking', 'skraft-repl', `${process.pid}.json`)
  while (!(existsSync(journal) && JSON.parse(readFileSync(journal, 'utf8')).runs.length === 1)) await new Promise((done) => setTimeout(done, 50))
  host.notify('notifications/cancelled', { requestId })
  const answer = await new Promise((resolve) => {
    const poll = setInterval(() => {
      const found = host.received.find(({ id }) => id === requestId)
      if (found !== undefined) { clearInterval(poll); resolve(found) }
    }, 50)
  })

  assert.equal(JSON.parse(textOf(status)).slug, SLUG)
  assert.match(textOf(answer.result), /\ninterrupted: Error: interrupted$/)
  await host.close()
})

test('a cancellation that reaches the server right behind its request is not lost: no cell starts and no program runs', BOUNDED, async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  await toDeliveryAttempt(cwd)
  const host = mcpHost({ roots: [cwd] })
  await host.initialize()
  const requestId = 'repl-cancelled-early'
  const marker = join(cwd, 'ran.txt')
  const code = `await run([${NODE}, '-e', 'require("node:fs").writeFileSync(${JSON.stringify(marker.replaceAll('\\', '/'))}, "x")'])`
  host.write(JSON.stringify({ jsonrpc: '2.0', id: requestId, method: 'tools/call', params: { name: 'skraft_repl', arguments: { code } } }))
  host.notify('notifications/cancelled', { requestId })
  const answer = await new Promise((resolve) => {
    const poll = setInterval(() => {
      const found = host.received.find(({ id }) => id === requestId)
      if (found !== undefined) { clearInterval(poll); resolve(found) }
    }, 50)
  })

  assert.match(textOf(answer.result), /^repl-interrupted: /)
  assert.equal(existsSync(marker), false)
  await host.close()
})
