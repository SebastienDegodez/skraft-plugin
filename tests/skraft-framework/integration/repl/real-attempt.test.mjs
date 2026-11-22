import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRepl } from '../../../../plugins/skraft-framework/engine/application/repl/repl-usecase.mjs'
import { createRunDigests } from '../../../../plugins/skraft-framework/engine/infrastructure/repl/run-digests.mjs'
import { createProgramLauncher } from '../../../../plugins/skraft-framework/engine/infrastructure/process/program-launcher.mjs'
import { createNodeKernelHost } from '../../../../plugins/skraft-framework/engine/infrastructure/repl/node-kernel.mjs'
import { createOrphanJournal, processCreation } from '../../../../plugins/skraft-framework/engine/infrastructure/repl/orphans.mjs'
import { InMemoryRunLock } from '../../unit/support/in-memory-host.mjs'
import { agent, green, nominal, scripted, SLUG } from '../../unit/support/pipeline-host.mjs'
import { tempFolder } from '../support/workspace.mjs'

// The pipeline is the unit tests' (an attempt open in memory); the REPL is real: a real kernel
// process, real programs started in a real folder, the real orphan journal.
const BOUNDED = { timeout: 60_000 }
const NODE = JSON.stringify(process.execPath)
const SERVER_CREATED = await processCreation(process.pid)

const realRun = (t, call) => {
  const root = tempFolder(t)
  mkdirSync(join(root, 'api'))
  const orphans = createOrphanJournal({ folder: join(root, '.copilot-tracking', 'skraft-repl') })
  const host = scripted({}, (it) => nominal(it).map((behaviour, index) => (index === 3 ? agent({ work: async (repos) => { await call(repl, root); green(SLUG, 'Checkout', '')(repos) } })(it) : behaviour)))
  host.deps.repl = { root, kernels: createNodeKernelHost(), launcher: createProgramLauncher({ root }), orphans, locks: new InMemoryRunLock(host.tracking, 'a'), server: { pid: process.pid, created: SERVER_CREATED }, budgetMs: 30_000, digests: createRunDigests() }
  const repl = createRepl(host.deps, { entry: null, reaped: false })
  t.after(() => repl.close())
  return { host, repl, root, orphans }
}

test('a software engineer runs real programs through the REPL: an argv array and a command line, in a folder of the working copy, and reads their exit codes and output', BOUNDED, async (t) => {
  const answers = []
  const { host } = realRun(t, async (repl) => {
    answers.push(await repl.call({ code: `const unit = await gate('test', [process.execPath, '-e', 'console.log("3 passed"); process.exit(1)'], { cwd: 'api' }); const lint = await run('echo linted'); [unit.exitCode, unit.output.trim(), lint.exitCode, lint.output.trim()]` }))
  })

  assert.equal((await host.start()).status, 'done')

  assert.equal(answers[0].ok, true)
  const lines = answers[0].text.split('\n')
  assert.match(lines[0], /^r1 exit 1 \(\d+\.\d s\) .* - logs\/runs\/deliver-1-1\/1\.log$/)
  assert.match(lines[1], /^r2 exit 0 \(\d+\.\d s\) echo linted - logs\/runs\/deliver-1-1\/2\.log$/)
  assert.equal(lines[2], "=> [ 1, '3 passed', 0, 'linted' ]")
})

test('a run\'s folder is traced relative to the working copy, with / between its parts, however the cell named it', BOUNDED, async (t) => {
  const { host } = realRun(t, async (repl, root) => {
    mkdirSync(join(root, 'api', 'src'))
    await repl.call({ code: `await run([process.execPath, '-e', '0'], { cwd: ${JSON.stringify(join(root, 'api'))} }); await run([process.execPath, '-e', '0'], { cwd: 'api/./src/' })` })
  })

  await host.start()

  const trace = host.tracking.files.get(`${SLUG}/logs/runs/deliver-1-1/runs.jsonl`).trim().split('\n').map((line) => JSON.parse(line))
  assert.deepEqual(trace.filter(({ type }) => type === 'run').map(({ cwd }) => cwd), ['api', 'api/src'])
})

test('a cell that prints 8 MiB leaves a cell log of 1 MiB at most, its first and last lines kept', BOUNDED, async (t) => {
  const { host } = realRun(t, async (repl) => {
    await repl.call({ code: "const line = 'x'.repeat(1023); console.log('first'); for (let i = 0; i < 8192; i += 1) console.log(line); console.log('last')" })
  })

  await host.start()

  const log = host.tracking.files.get(`${SLUG}/logs/runs/deliver-1-1/cell-1.log`)
  assert.ok(Buffer.byteLength(log) <= 1_048_576 + 200, `${Buffer.byteLength(log)} bytes`)
  assert.deepEqual([log.startsWith('first\n'), log.endsWith('\nlast\n')], [true, true])
})

test('a program started in a folder outside the working copy is not started, and the cell reads why', BOUNDED, async (t) => {
  const answers = []
  const { host } = realRun(t, async (repl) => {
    answers.push(await repl.call({ code: `const r = await run(['${process.platform === 'win32' ? 'cmd' : 'ls'}'], { cwd: '..' }); [r.exitCode, r.error]` }))
  })

  await host.start()

  assert.match(answers[0].text, /=> \[ null, 'the folder is outside the working copy or does not exist' \]$/)
})

test('the processes the REPL started are written to the orphan journal while they run and forgotten when the attempt ends', BOUNDED, async (t) => {
  const seen = []
  const { host, root, repl } = realRun(t, async (one, folder) => {
    await one.call({ code: `globalThis.long = run([process.execPath, '-e', 'setInterval(() => {}, 1000)'])` })
    const journal = join(folder, '.copilot-tracking', 'skraft-repl', `${process.pid}.json`)
    for (let tries = 0; tries < 100 && !(existsSync(journal) && JSON.parse(readFileSync(journal, 'utf8')).runs.length === 1); tries += 1) await new Promise((done) => setTimeout(done, 50))
    seen.push(existsSync(journal) ? JSON.parse(readFileSync(journal, 'utf8')) : null)
    await one.call({ code: 'long.kill("SIGKILL", 0)' })
  })

  await host.start()
  await repl.close()

  assert.equal(seen[0].server.pid, process.pid)
  assert.equal(seen[0].runs.length, 1)
  assert.equal(typeof seen[0].kernel.pid, 'number')
  assert.equal(existsSync(join(root, '.copilot-tracking', 'skraft-repl', `${process.pid}.json`)), false)
})
