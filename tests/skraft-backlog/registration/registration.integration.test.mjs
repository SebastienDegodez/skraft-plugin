// The Copilot extension of skraft-backlog as the host sees it: register joins the workflow and the
// canvas from the SDK functions the entry hands over, each built on its own, failures through the
// session log, and the working directory read from the session, never from the process.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { CANVAS_REFUSED, NO_CANVAS, NO_WORKFLOW, register } from '../../../plugins/skraft-backlog/prd-backlog/register.mjs'
import { simulatedContext } from '../prd-backlog/simulated-ctx.mjs'

const PLUGIN_ROOT = fileURLToPath(new URL('../../../plugins/skraft-backlog/', import.meta.url))
const SENTINEL = 'skraft-backlog-sentinel-91c2'

class FakeCanvasError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/**
 * The SDK as the entry hands it over: it records each join and each session.log, and fails the
 * way the host does when told to.
 * @param {{ defineFails?: boolean, canvasFails?: boolean, refuseCanvases?: boolean, refuseOnce?: boolean, refuseAll?: boolean, session?: object }} [options]
 */
const simulatedSdk = ({ defineFails = false, canvasFails = false, refuseCanvases = false, refuseOnce = false, refuseAll = false, session: more = {} } = {}) => {
  const joins = []
  const logs = []
  const session = { ...more, log: async (message, options) => { logs.push({ message, level: options?.level ?? 'info' }) } }
  const sdk = {
    joins, logs, session,
    defineWorkflow: (definition) => {
      if (defineFails) throw new Error(`meta.phases is required ${SENTINEL}`)
      return { meta: definition.meta, run: definition.run }
    },
    createCanvas: (options) => {
      if (canvasFails) throw new Error(`canvas declaration rejected ${SENTINEL}`)
      return { ...options, declaration: { id: options.id } }
    },
    CanvasError: FakeCanvasError,
    joinSession: async (config) => {
      joins.push(config)
      if (refuseAll || (refuseOnce && joins.length === 1) || (refuseCanvases && config.canvases.length > 0)) throw new Error(`Invalid canvas ${SENTINEL}`)
      return session
    },
  }
  return sdk
}

/** What each join registered. */
const registered = (joins) => joins.map((config) => ({ workflows: config.workflows.map((w) => w.meta.name), canvases: config.canvases.map((c) => c.id) }))
const BOTH = { workflows: ['skraft-prd-backlog'], canvases: ['skraft-backlog'] }

test('the workflow and the canvas join the session together, with its icon, and nothing is logged', async () => {
  const sdk = simulatedSdk()

  assert.equal(await register(sdk), sdk.session)

  assert.deepEqual(registered(sdk.joins), [BOTH])
  assert.equal(sdk.joins[0].canvases[0].declaration.icon, 'icon.png')
  assert.equal(typeof sdk.joins[0].onEvent, 'function', 'the directory tracker listens before the join')
  assert.deepEqual(sdk.logs, [])
})

test('a workflow definition the SDK rejects leaves the canvas registered, and the session log says so in a fixed message', async () => {
  const sdk = simulatedSdk({ defineFails: true })

  await register(sdk)

  assert.deepEqual(registered(sdk.joins), [{ workflows: [], canvases: ['skraft-backlog'] }])
  assert.deepEqual(sdk.logs, [{ level: 'error', message: NO_WORKFLOW }])
  assert.ok(!JSON.stringify(sdk.logs).includes(SENTINEL), 'no exception text reaches the log')
})

test('a join the host refuses is joined again without the canvas; the workflow stays and the session log says the canvas is missing', async () => {
  const sdk = simulatedSdk({ refuseCanvases: true })

  assert.equal(await register(sdk), sdk.session)

  assert.deepEqual(registered(sdk.joins), [BOTH, { workflows: ['skraft-prd-backlog'], canvases: [] }])
  assert.deepEqual(sdk.logs, [{ level: 'error', message: CANVAS_REFUSED }])
})

test('a refused join says the canvas is missing only when one was offered', async () => {
  const sdk = simulatedSdk({ canvasFails: true, refuseOnce: true })

  assert.equal(await register(sdk), sdk.session)

  assert.deepEqual(registered(sdk.joins), [{ workflows: ['skraft-prd-backlog'], canvases: [] }, { workflows: ['skraft-prd-backlog'], canvases: [] }])
  assert.deepEqual(sdk.logs, [{ level: 'error', message: NO_CANVAS }])
})

test('a host that refuses every join leaves no session; a log that fails does not throw either', async () => {
  const refusing = simulatedSdk({ refuseAll: true })
  assert.equal(await register(refusing), null)
  assert.deepEqual(registered(refusing.joins), [BOTH, { workflows: ['skraft-prd-backlog'], canvases: [] }])

  const closed = simulatedSdk({ defineFails: true })
  closed.session.log = async () => { throw new Error('log is closed') }
  assert.equal(await register(closed), closed.session)
})

test('registering writes nothing to stdout, the JSON-RPC channel, nor to stderr', async (t) => {
  const written = []
  for (const stream of [process.stdout, process.stderr]) {
    const original = stream.write
    stream.write = (/** @type {any} */ chunk, ...rest) => {
      written.push(String(chunk))
      return original.call(stream, chunk, ...rest)
    }
    t.after(() => { stream.write = original })
  }

  await register(simulatedSdk({ defineFails: true, refuseCanvases: true }))

  assert.deepEqual(written.filter((text) => text.includes('skraft')), [])
})

/** A directory holding a PRD with no FR requirement at docs/prd.md. */
const directoryWithPrd = async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), 'skraft-backlog-session-'))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  await mkdir(join(cwd, 'docs'), { recursive: true })
  await writeFile(join(cwd, 'docs', 'prd.md'), '# A PRD with no requirement yet\n', 'utf8')
  return cwd
}

test('a run reads the session directory when it starts: none yet is refused, then the joined one, then the one session.context_changed moves it to', async (t) => {
  const joinedIn = await directoryWithPrd(t)
  const movedTo = await mkdtemp(join(tmpdir(), 'skraft-backlog-moved-'))
  t.after(() => rm(movedTo, { recursive: true, force: true }))
  const run = (sdk) => sdk.joins[0].workflows[0].run(simulatedContext({ args: { prd: 'docs/prd.md' } }).ctx)

  const unknown = simulatedSdk()
  await register(unknown)
  assert.deepEqual(await run(unknown), { status: 'refused', code: 'no-directory', reason: 'the session has no working directory yet' })

  const sdk = simulatedSdk({ session: { rpc: { metadata: { snapshot: async () => ({ workingDirectory: joinedIn }) } } } })
  await register(sdk)
  assert.match((await run(sdk)).reason, /defines no FR-### requirement/, 'the PRD is read in the joined directory')
  sdk.joins[0].onEvent({ type: 'session.context_changed', data: { cwd: 'relative/ignored' } })
  sdk.joins[0].onEvent({ type: 'session.context_changed', data: { cwd: movedTo } })
  assert.match((await run(sdk)).reason, /cannot be read/, 'the PRD is looked for where the session moved')
})

test('only the extension entry imports the Copilot SDK, and it hands it to register', async () => {
  const entries = await readdir(PLUGIN_ROOT, { withFileTypes: true, recursive: true })
  const sources = entries.filter((e) => e.isFile() && e.name.endsWith('.mjs')).map((e) => join(e.parentPath, e.name))
  const importers = []
  for (const path of sources) if ((await readFile(path, 'utf8')).includes('@github/copilot-sdk')) importers.push(relative(PLUGIN_ROOT, path).split(sep).join('/'))

  assert.deepEqual(importers, ['com.github.copilot/extensions/skraft-prd-backlog/extension.mjs'])
  const entry = await readFile(join(PLUGIN_ROOT, importers[0]), 'utf8')
  assert.match(entry, /await register\(\{ defineWorkflow, joinSession, createCanvas, CanvasError \}\)/)
  assert.doesNotMatch(entry, /process\.(cwd|stdout|stderr)/)
})
