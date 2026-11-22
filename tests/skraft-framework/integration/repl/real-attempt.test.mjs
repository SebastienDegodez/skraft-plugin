import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

const realRun = (t, call, { kernels = createNodeKernelHost() } = {}) => {
  const root = tempFolder(t)
  mkdirSync(join(root, 'api'))
  const orphans = createOrphanJournal({ folder: join(root, '.copilot-tracking', 'skraft-repl') })
  const host = scripted({}, (it) => nominal(it).map((behaviour, index) => (index === 3 ? agent({ work: async (repos) => { await call(repl, root); green(SLUG, 'Checkout', '')(repos) } })(it) : behaviour)))
  host.deps.repl = { root, kernels, launcher: createProgramLauncher({ root }), orphans, locks: new InMemoryRunLock(host.tracking, 'a'), server: { pid: process.pid, created: SERVER_CREATED }, budgetMs: 30_000, digests: createRunDigests() }
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

test('the project\'s REPL library under .repl/lib is in every cell as lib.<name>, its modules may start runs, and one that throws on load leaves the kernel usable', BOUNDED, async (t) => {
  const answers = []
  const { host, root } = realRun(t, async (repl) => { answers.push(await repl.call({ code: '[lib.greet.hello(), (await lib.greet.check()).exitCode, typeof lib.broken, typeof lib["my-tool"]]' })) })
  mkdirSync(join(root, '.repl', 'lib'), { recursive: true })
  writeFileSync(join(root, '.repl', 'lib', 'greet.mjs'), "export const hello = () => 'hello'\nexport const check = () => run([process.execPath, '-e', '0'], { label: 'from lib' })\n")
  writeFileSync(join(root, '.repl', 'lib', 'broken.mjs'), "throw new Error('broken on load')\n")
  writeFileSync(join(root, '.repl', 'lib', 'my-tool.mjs'), "throw new Error('loaded')\n")

  await host.start()

  const lines = answers[0].text.split('\n')
  assert.deepEqual(lines.slice(0, 3), ['lib: greet', 'lib: broken could not be loaded (it threw, or took more than 10 seconds); the kernel goes on without it', 'lib: my-tool.mjs is not loaded: the name of a module must be a JavaScript identifier'])
  assert.match(lines[3], /^r1 exit 0 /)
  assert.equal(lines[4], "=> [ 'hello', 0, 'undefined', 'undefined' ]")
})

test('require in a cell finds the packages of .repl first, then those of the working copy', BOUNDED, async (t) => {
  const answers = []
  const { host, root } = realRun(t, async (repl) => { answers.push(await repl.call({ code: "[require('fake-dep').name, require('root-dep').name, require('node:path').sep.length]" })) })
  for (const [folder, name] of [[join(root, '.repl', 'node_modules', 'fake-dep'), 'from .repl'], [join(root, 'node_modules', 'root-dep'), 'from the working copy']]) {
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, 'index.js'), `module.exports = { name: ${JSON.stringify(name)} }\n`)
  }
  writeFileSync(join(root, '.repl', 'package.json'), JSON.stringify({ private: true, dependencies: { 'fake-dep': '1.0.0' } }))

  await host.start()

  assert.equal(answers[0].text, "=> [ 'from .repl', 'from the working copy', 1 ]")
})

test('a package of .repl that cannot load one of its own dependencies fails, never replaced by the working copy\'s package of the same name', BOUNDED, async (t) => {
  const answers = []
  const { host, root } = realRun(t, async (repl) => { answers.push(await repl.call({ code: "require('dup').name" })) })
  for (const [folder, body] of [[join(root, '.repl', 'node_modules', 'dup'), "require('nowhere')\n"], [join(root, 'node_modules', 'dup'), "module.exports = { name: 'the working copy' }\n"]]) {
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, 'index.js'), body)
  }

  await host.start()

  assert.match(answers[0].text, /^error: Error: Cannot find module 'nowhere'/)
})

test('a .repl/package.json with dependencies and no .repl/node_modules is told at the first result', BOUNDED, async (t) => {
  const answers = []
  const { host, root } = realRun(t, async (repl) => { answers.push(await repl.call({ code: '1' })) })
  mkdirSync(join(root, '.repl'))
  writeFileSync(join(root, '.repl', 'package.json'), JSON.stringify({ private: true, dependencies: { 'fake-dep': '1.0.0' } }))

  await host.start()

  assert.equal(answers[0].text, 'lib: the packages of .repl/package.json are not installed: run npm ci --prefix .repl in the working copy\n=> 1')
})

test('a kernel whose REPL library never lets it be ready is ended at the start deadline, and the next call, once the module is gone, answers', BOUNDED, async (t) => {
  const answers = []
  const { host, root } = realRun(t, async (repl, folder) => {
    const asked = Date.now()
    answers.push(await repl.call({ code: '1' }), Date.now() - asked)
    rmSync(join(folder, '.repl', 'lib', 'spin.mjs'))
    await repl.reset()
    answers.push(await repl.call({ code: '2' }))
  }, { kernels: createNodeKernelHost({ startMs: 3000 }) })
  mkdirSync(join(root, '.repl', 'lib'), { recursive: true })
  writeFileSync(join(root, '.repl', 'lib', 'spin.mjs'), 'while (true) {}\n')

  await host.start()

  assert.equal(answers[0].code, 'repl-failed')
  assert.ok(answers[1] < 8000, `refused after ${answers[1]} ms`)
  assert.match(answers[2].text, /(^|\n)=> 2$/)
})

test('a real kernel started again by a reset gives its first run the next id of the attempt', BOUNDED, async (t) => {
  const answers = []
  const { host } = realRun(t, async (repl) => {
    answers.push(await repl.call({ code: "await run([process.execPath, '-e', '0'])" }), await repl.reset(), await repl.call({ code: "await run([process.execPath, '-e', '0'])" }))
  })

  await host.start()

  assert.match(answers[2].text, /\nr2 exit 0 \(\d+\.\d s\) .* - logs\/runs\/deliver-1-1\/2\.log(\n|$)/)
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
