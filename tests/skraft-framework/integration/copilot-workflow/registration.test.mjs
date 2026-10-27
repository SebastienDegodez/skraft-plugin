import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { register } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/register.mjs'
import { createInit } from '../../../../plugins/skraft-framework/engine/application/pipeline/init-usecase.mjs'
import { openJournal } from '../../../../plugins/skraft-framework/engine/application/journal/run-journal.mjs'
import { createNodeAdapters } from '../../../../plugins/skraft-framework/engine/infrastructure/node-adapters.mjs'
import { PLUGIN_ROOT, eventsPath, simulatedContext, workingCopy, writesNothing } from './simulated-host.mjs'
import { registered, simulatedSdk } from './simulated-sdk.mjs'

/** Every .mjs file under a folder, node_modules left out. */
const sourcesUnder = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true })
  const paths = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.mjs')).map((entry) => join(entry.parentPath, entry.name)).filter((path) => !path.split(sep).includes('node_modules'))
  return Promise.all(paths.map(async (path) => ({ path, source: await readFile(path, 'utf8') })))
}

const BOTH = { workflows: ['skraft-pipeline'], tools: ['skraft_decide'] }

const registerOn = async (t, sdk) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  return register({ defineWorkflow: sdk.defineWorkflow, joinSession: sdk.joinSession, pluginRoot: PLUGIN_ROOT, home: `${cwd}-home` })
}

test('the workflow and the tool join the session together, and nothing is logged', async (t) => {
  const sdk = simulatedSdk()

  const session = await registerOn(t, sdk)

  assert.equal(session, sdk.session)
  assert.deepEqual(registered(sdk.joins), [BOTH])
  assert.deepEqual(sdk.logs, [])
})

/**
 * The host's own tools in a session with no plugin, measured by the probe check
 * `skraft-tool-names-free` on Copilot CLI 1.0.102-1 with a login (docs/v2/host-verification.md,
 * 2026-10-27); without a login the host offers the same set minus the two workflow tools.
 */
const NATIVE_TOOLS = Object.freeze([
  'bash', 'create', 'dynamic_workflows_manage', 'edit', 'extensions_manage', 'extensions_reload', 'glob', 'grep', 'list_agents', 'list_bash', 'read_agent',
  'read_bash', 'run_dynamic_workflow', 'semantic_code_search', 'skill', 'sql', 'stop_bash', 'task', 'view', 'web_fetch', 'write_agent',
])

test('no tool the driver registers is named like a tool the Copilot host already offers', async (t) => {
  const sdk = simulatedSdk()

  await registerOn(t, sdk)

  const tools = registered(sdk.joins).flatMap((join) => join.tools)
  assert.notEqual(tools.length, 0)
  assert.deepEqual(tools.filter((name) => NATIVE_TOOLS.includes(name)), [])
})

test('a workflow definition the SDK rejects leaves the tool registered, and the session log says the workflow is missing', async (t) => {
  const sdk = simulatedSdk({ defineFails: true })

  await registerOn(t, sdk)

  assert.deepEqual(registered(sdk.joins), [{ workflows: [], tools: ['skraft_decide'] }])
  assert.deepEqual(sdk.logs, [{ level: 'error', message: 'skraft: the skraft-pipeline workflow could not be defined; it is not available in this session.' }])
})

test('a join the host refuses is joined again without the tool; the workflow stays and the session log says the tool is missing', async (t) => {
  const sdk = simulatedSdk({ refuseTools: true })

  const session = await registerOn(t, sdk)

  assert.equal(session, sdk.session)
  assert.deepEqual(registered(sdk.joins), [BOTH, { workflows: ['skraft-pipeline'], tools: [] }])
  assert.deepEqual(sdk.logs, [{ level: 'error', message: 'skraft: the host refused the skraft_decide tool; answer a skraft question with skraft decide in a terminal.' }])
})

test('a host that refuses every join leaves no session and does not throw', async (t) => {
  const sdk = simulatedSdk({ refuseAll: true })

  assert.equal(await registerOn(t, sdk), null)
  assert.deepEqual(registered(sdk.joins), [BOTH, { workflows: ['skraft-pipeline'], tools: [] }])
})

test('a session whose log fails does not make the registration throw', async (t) => {
  const sdk = simulatedSdk({ defineFails: true })
  sdk.session.log = async () => { throw new Error('log is closed') }

  assert.equal(await registerOn(t, sdk), sdk.session)
})

test('only the extension entry imports the Copilot SDK, and it hands it to register', async () => {
  const importers = (await sourcesUnder(PLUGIN_ROOT)).filter(({ source }) => source.includes('@github/copilot-sdk')).map(({ path }) => relative(PLUGIN_ROOT, path).split(sep).join('/'))

  assert.deepEqual(importers, ['com.github.copilot/extensions/skraft-pipeline/extension.mjs'])
  assert.match(await readFile(join(PLUGIN_ROOT, importers[0]), 'utf8'), /await register\(\{ defineWorkflow, joinSession,/)
})

/** The two repositories a session moves between. */
const twoRepositories = async (t) => {
  const [a, b] = [await workingCopy(), await workingCopy()]
  t.after(a.cleanup)
  t.after(b.cleanup)
  return { first: a.cwd, second: b.cwd }
}

/** A session that reports this working directory once joined. */
const joinedAt = (workingDirectory) => simulatedSdk({ session: { rpc: { metadata: { snapshot: async () => ({ workingDirectory }) } } } })

const registerWith = (sdk, home) => register({ defineWorkflow: sdk.defineWorkflow, joinSession: sdk.joinSession, pluginRoot: PLUGIN_ROOT, home })

/** Runs the registered workflow on a new slug, then calls the registered tool. */
const runAndDecide = async (sdk, slug) => {
  const [{ workflows: [workflow], tools: [tool] }] = sdk.joins
  const { ctx } = simulatedContext({ args: { slug }, behaviours: [writesNothing] })
  return { outcome: await workflow.run(ctx), decided: await tool.handler({ key: 'adr-1', answer: 'RATIFIED' }) }
}

/** Which of the two repositories holds the slug's journal. */
const journaledIn = ({ first, second }, slug) => [existsSync(eventsPath(first, slug)), existsSync(eventsPath(second, slug))]

test('a run and a decision act on the directory the session was joined in, then on the one session.context_changed moves it to', async (t) => {
  const repositories = await twoRepositories(t)
  const sdk = joinedAt(repositories.first)
  await registerWith(sdk, `${repositories.first}-home`)

  const before = await runAndDecide(sdk, 'checkout')
  sdk.joins[0].onEvent({ type: 'session.context_changed', data: { cwd: repositories.second } })
  const after = await runAndDecide(sdk, 'refund')

  assert.deepEqual(journaledIn(repositories, 'checkout'), [true, false])
  assert.deepEqual(journaledIn(repositories, 'refund'), [false, true])
  assert.deepEqual([before.outcome.slug, after.outcome.slug], ['checkout', 'refund'])
  assert.deepEqual([before.decided, after.decided], [
    'Refused: no question has that key; no question is waiting; nothing was recorded.',
    'Refused: no question has that key; no question is waiting; nothing was recorded.',
  ])
})

test('a decision follows the session even with no run: a second repository with no pipeline refuses it', async (t) => {
  const repositories = await twoRepositories(t)
  const sdk = joinedAt(repositories.first)
  await registerWith(sdk, `${repositories.first}-home`)
  await runAndDecide(sdk, 'checkout')

  sdk.joins[0].onEvent({ type: 'session.context_changed', data: { cwd: repositories.second } })
  const decided = await sdk.joins[0].tools[0].handler({ key: 'adr-1', answer: 'RATIFIED' })

  assert.match(decided, /^Refused: no active pipeline in this working copy/)
})

test('a context change to a relative path, or an event of another type, leaves the directory where it was', async (t) => {
  const repositories = await twoRepositories(t)
  const sdk = joinedAt(repositories.first)
  await registerWith(sdk, `${repositories.first}-home`)

  sdk.joins[0].onEvent({ type: 'session.context_changed', data: { cwd: 'elsewhere' } })
  sdk.joins[0].onEvent({ type: 'session.context_changed' })
  sdk.joins[0].onEvent(undefined)
  sdk.joins[0].onEvent({ type: 'session.title_changed', data: { cwd: repositories.second } })
  await runAndDecide(sdk, 'checkout')

  assert.deepEqual(journaledIn(repositories, 'checkout'), [true, false])
})

test('a context change during the join wins over the directory the session reports once joined', async (t) => {
  const repositories = await twoRepositories(t)
  const sdk = joinedAt(repositories.first)
  const joinSession = async (config) => {
    config.onEvent({ type: 'session.context_changed', data: { cwd: repositories.second } })
    return sdk.joinSession(config)
  }
  await register({ defineWorkflow: sdk.defineWorkflow, joinSession, pluginRoot: PLUGIN_ROOT, home: `${repositories.first}-home` })

  await runAndDecide(sdk, 'checkout')

  assert.deepEqual(journaledIn(repositories, 'checkout'), [false, true])
})

test('with no directory known, a run is refused and the tool records nothing', async () => {
  const failing = { rpc: { metadata: { snapshot: async () => { throw new Error('unsupported') } } } }
  for (const sdk of [simulatedSdk(), joinedAt('relative/path'), simulatedSdk({ session: failing })]) {
    await registerWith(sdk, PLUGIN_ROOT)

    const { outcome, decided } = await runAndDecide(sdk, 'checkout')

    assert.deepEqual(outcome, { status: 'refused', slug: null, phase: null, code: 'no-directory', reason: 'the session has no working directory yet' })
    assert.equal(decided, 'Refused: the session has no working directory yet; nothing was recorded.')
  }
})

test('the registered tool records a decision only once the joined session confirms it', async (t) => {
  const repositories = await twoRepositories(t)
  const asked = []
  const sdk = simulatedSdk({ session: {
    rpc: { metadata: { snapshot: async () => ({ workingDirectory: repositories.first }) }, mode: { get: async () => 'interactive' } },
    capabilities: { ui: { elicitation: true } },
    ui: { confirm: async (message) => { asked.push(message); return false } },
  } })
  await registerWith(sdk, `${repositories.first}-home`)
  const adapters = createNodeAdapters({ cwd: repositories.first, pluginRoot: PLUGIN_ROOT, home: `${repositories.first}-home` })
  await createInit(adapters).init({ slug: 'checkout' })
  const opened = await openJournal(adapters, 'checkout')
  await opened.journal.append('question.asked', { key: 'adr-1', kind: 'adr-ratification', text: 'Ratify?', options: ['RATIFIED', 'REJECTED'], refusals: ['REJECTED'], header: 'ADR', step: 'adr', visit: 1, subjects: [] })

  const decided = await sdk.joins[0].tools[0].handler({ key: 'adr-1', answer: 'RATIFIED' })

  assert.equal(decided, 'Refused: you did not confirm the decision in Copilot; nothing was recorded.')
  assert.deepEqual(asked, ['skraft checkout: record RATIFIED as your answer to adr-1?'])
})
