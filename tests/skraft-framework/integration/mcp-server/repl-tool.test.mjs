import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SLUG, pipelineRepository } from '../support/pipeline-repository.mjs'
import { skraft } from '../support/workspace.mjs'
import { toDeliveryAttempt } from './delivery-attempt.mjs'
import { mcpHost } from './mcp-host.mjs'
import { createOrphanJournal, processCreation } from '../../../../plugins/skraft-framework/engine/infrastructure/repl/orphans.mjs'

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
  const reset = await host.call('skraft_repl', { code: '1', reset: true })

  assert.deepEqual([listed.inputSchema.required, listed.inputSchema.additionalProperties, Object.keys(listed.inputSchema.properties)], [['code'], false, ['code', 'workspace']])
  assert.match(listed.description, /await handle gives \{ exitCode, output, durationMs, head, log \} \(head: the HEAD of the repository holding cwd when the program ended\)/)
  assert.deepEqual([unknown.isError, textOf(unknown)], [true, 'skraft_repl takes only these arguments: code, workspace'])
  assert.deepEqual([reset.isError, textOf(reset)], [true, 'skraft_repl takes only these arguments: code, workspace'])
  assert.match(listed.description, /call skraft_repl_reset/)
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

  assert.deepEqual([first, second].map((one) => textOf(one).slice(0, 10)).sort(), [`=> ${journal.kernel.pid}`, "repl-busy:"].sort(), "one call ran the cell in the kernel the journal names, the other was told it runs")
})

test('skraft_status answers well before the system gives a process\'s start time, while a run starts', BOUNDED, async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  await toDeliveryAttempt(cwd)
  const slowReader = { file: process.execPath, args: ['-e', 'setTimeout(() => console.log("slow start time"), 8000)'] }
  const adapt = (adapters, directory) => ({ ...adapters, repl: { ...adapters.repl, orphans: createOrphanJournal({ folder: join(directory, '.copilot-tracking', 'skraft-repl'), creationOf: (pid) => processCreation(pid, process.platform, slowReader) }) } })
  const host = mcpHost({ roots: [cwd], adapt })
  await host.initialize()
  t.after(() => host.close())
  await host.call('skraft_repl', { code: '1' })

  host.write(JSON.stringify({ jsonrpc: '2.0', id: 'starts-a-run', method: 'tools/call', params: { name: 'skraft_repl', arguments: { code: `globalThis.long = run([${NODE}, '-e', 'setTimeout(() => {}, 5000)']); 1` } } }))
  const slowest = { took: 0, slug: null }
  for (const until = Date.now() + 2500; Date.now() < until;) {
    const asked = Date.now()
    slowest.slug = JSON.parse(textOf(await host.call('skraft_status'))).slug
    slowest.took = Math.max(slowest.took, Date.now() - asked)
  }

  assert.equal(slowest.slug, SLUG)
  assert.ok(slowest.took < 4000, `skraft_status took ${slowest.took} ms`)
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

test('skraft_repl_reset is listed with only the workspace, marked destructive, and refuses any other argument without echoing it', BOUNDED, async (t) => {
  const { cwd } = pipelineRepository(t)
  const host = mcpHost({ roots: [cwd] })
  await host.initialize()

  const listed = (await host.request('tools/list')).result.tools.find(({ name }) => name === 'skraft_repl_reset')
  const unknown = await host.call('skraft_repl_reset', { code: 'secret-name' })

  assert.deepEqual([listed?.inputSchema.required, listed?.inputSchema.additionalProperties, Object.keys(listed?.inputSchema.properties ?? {})], [[], false, ['workspace']])
  assert.deepEqual([listed.annotations.destructiveHint, listed.annotations.readOnlyHint], [true, false])
  assert.deepEqual([unknown.isError, textOf(unknown)], [true, 'skraft_repl_reset takes only these arguments: workspace'])
  await host.close()
})

test('with no attempt open, skraft_repl_reset is refused with a fixed text', BOUNDED, async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  const host = mcpHost({ roots: [cwd] })
  await host.initialize()

  const refused = await host.call('skraft_repl_reset')

  assert.deepEqual([refused?.isError, refused && textOf(refused)], [true, 'repl-unavailable: skraft_repl works only inside the open attempt of an agent that commits code, and none is open now'])
  await host.close()
})

test('skraft_repl_reset during a cell waiting on a run ends the kernel and the run: the cell answers repl-reset, and the next skraft_repl starts a fresh kernel whose runs take the next ids', BOUNDED, async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  await toDeliveryAttempt(cwd)
  const host = mcpHost({ roots: [cwd] })
  await host.initialize()
  t.after(() => host.close())
  await host.call('skraft_repl', { code: 'var kept = 1' })
  const waiting = host.call('skraft_repl', { code: `await run([${NODE}, '-e', 'setInterval(() => {}, 1000)'])` })
  const journal = join(cwd, '.copilot-tracking', 'skraft-repl', `${process.pid}.json`)
  while (!(existsSync(journal) && JSON.parse(readFileSync(journal, 'utf8')).runs.length === 1)) await new Promise((done) => setTimeout(done, 50))

  const reset = await host.call('skraft_repl_reset')

  assert.deepEqual([reset?.isError, reset && textOf(reset)], [false, 'repl-reset: the kernel of this attempt was ended on request, with the runs it had started: its variables are gone, and the next skraft_repl starts a fresh kernel'])
  const cell = await waiting
  const next = await host.call('skraft_repl', { code: `await run([${NODE}, '-e', '0']); typeof kept` })
  assert.match(textOf(cell), /^repl-reset: /)
  assert.match(textOf(next), /^repl-fresh: .*\nr2 exit 0 \(\d+\.\d s\) .* - logs\/runs\/deliver-1-1\/2\.log\n=> 'undefined'$/)
})

test('skraft_repl_reset is never refused as busy: during a cell that never yields it answers within ten seconds, and with no kernel it says there was none', BOUNDED, async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  await toDeliveryAttempt(cwd)
  const host = mcpHost({ roots: [cwd] })
  await host.initialize()
  t.after(() => host.close())
  const none = await host.call('skraft_repl_reset')
  host.write(JSON.stringify({ jsonrpc: '2.0', id: 'spins', method: 'tools/call', params: { name: 'skraft_repl', arguments: { code: 'while (true) {}' } } }))
  await new Promise((done) => setTimeout(done, 300))

  const asked = Date.now()
  const reset = await host.call('skraft_repl_reset')

  assert.ok(Date.now() - asked < 10_000)
  assert.deepEqual([none?.isError, none && textOf(none)], [false, 'repl-no-kernel: no kernel of this attempt runs, so nothing was ended; the next skraft_repl starts a fresh kernel'])
  assert.match(textOf(reset), /^repl-reset: /)
})

test('skraft_repl_reset waits for no other tool: it answers while skraft_status is still running', BOUNDED, async (t) => {
  const { cwd } = pipelineRepository(t)
  await skraft(cwd, ['init', SLUG])
  await toDeliveryAttempt(cwd)
  const slow = { armed: false, entered: () => undefined }
  const adapt = (adapters) => {
    if (!slow.armed) return adapters
    slow.armed = false
    const current = adapters.activePipeline.current
    return { ...adapters, activePipeline: { ...adapters.activePipeline, current: async () => { slow.entered(); await new Promise((done) => setTimeout(done, 4000)); return current() } } }
  }
  const host = mcpHost({ roots: [cwd], adapt })
  await host.initialize()
  t.after(() => host.close())
  const entered = new Promise((resolve) => { slow.entered = resolve })
  slow.armed = true

  const status = host.call('skraft_status').then(() => 'status')
  await entered
  const first = await Promise.race([status, host.call('skraft_repl_reset').then((answer) => (answer?.isError === false ? 'reset' : 'refused'))])

  assert.equal(first, 'reset')
  await status
})
