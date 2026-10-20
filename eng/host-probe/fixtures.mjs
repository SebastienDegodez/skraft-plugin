// Fixtures of the Copilot host probe: throwaway plugins whose extension reports what the host
// gives it, and working copies holding a skraft pipeline that waits on an ADR question.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** The probe extension: two tools and a workflow, every name suffixed so two copies can coexist. */
export const probeExtensionSource = (suffix) => `// skraft host probe extension (generated, throwaway)
import { defineWorkflow, joinSession } from '@github/copilot-sdk/extension'
import { isAbsolute } from 'node:path'

const atLoad = process.cwd()
let tracked = null
let session
const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])
const messageOf = (error) => String(error && error.message ? error.message : error)

const state = async () => {
  let mode = null
  let modeError = null
  try { mode = await withTimeout(session.rpc.mode.get(), 5000) } catch (error) { modeError = messageOf(error) }
  return JSON.stringify({ atLoad, processCwd: process.cwd(), tracked, elicitation: session?.capabilities?.ui?.elicitation === true, mode, modeError })
}

const confirm = async () => {
  try {
    const value = await withTimeout(session.ui.confirm('skraft host probe: confirm() from a tool'), 60000)
    return JSON.stringify({ value })
  } catch (error) {
    return JSON.stringify({ error: messageOf(error) })
  }
}

session = await joinSession({
  onEvent: (event) => {
    if (event?.type === 'session.context_changed' && typeof event?.data?.cwd === 'string' && isAbsolute(event.data.cwd)) tracked = event.data.cwd
  },
  workflows: [defineWorkflow({
    meta: { name: 'skraft-probe-${suffix}', description: 'skraft host probe', phases: [{ title: 'Probe' }], argsSchema: { type: 'object' } },
    run: async (ctx) => {
      ctx.phase('Probe')
      if (ctx.args?.throw === true) throw new Error('skraft-probe-sentinel')
      if (ctx.args?.confirm === true) {
        const out = { hasSession: Boolean(ctx.session), elicitation: ctx.session?.capabilities?.ui?.elicitation === true }
        try { out.value = await withTimeout(ctx.session.ui.confirm('skraft host probe: confirm() from a workflow'), 60000) } catch (error) { out.error = messageOf(error) }
        return out
      }
      return { processCwd: process.cwd(), tracked }
    },
  })],
  tools: [
    { name: 'skraft_probe_state_${suffix}', description: 'skraft host probe: report the extension state', parameters: { type: 'object', properties: {} }, skipPermission: true, handler: state },
    { name: 'skraft_probe_confirm_${suffix}', description: 'skraft host probe: ask the host to confirm', parameters: { type: 'object', properties: {} }, skipPermission: true, handler: confirm },
  ],
})
`

/** An extension whose workflow definition lacks phases, next to a valid tool. */
const brokenWorkflowSource = `// skraft host probe: workflow without phases (generated, throwaway)
import { defineWorkflow, joinSession } from '@github/copilot-sdk/extension'
await joinSession({
  workflows: [defineWorkflow({ meta: { name: 'skraft-probe-broken', description: 'no phases' }, run: async () => ({}) })],
  tools: [{ name: 'skraft_probe_iso_tool', description: 'skraft host probe: isolation', parameters: { type: 'object', properties: {} }, skipPermission: true, handler: async () => 'ok' }],
})
`

/** An extension whose tool name the host should refuse, next to a valid workflow. */
const badToolSource = `// skraft host probe: tool with an invalid name (generated, throwaway)
import { defineWorkflow, joinSession } from '@github/copilot-sdk/extension'
await joinSession({
  workflows: [defineWorkflow({ meta: { name: 'skraft-probe-iso', description: 'isolation', phases: [{ title: 'Probe' }], argsSchema: { type: 'object' } }, run: async () => ({ ran: true }) })],
  tools: [{ name: 'bad name!', description: 'invalid name', parameters: { type: 'object', properties: {} }, skipPermission: true, handler: async () => 'ok' }],
})
`

const write = async (path, text) => {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, text, 'utf8')
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`

/**
 * A plugin laid out like skraft-framework: root Agent Plugins manifest, extension under
 * com.github.copilot/extensions/.
 */
const agentPluginsLayout = async (dir, name, extension, source) => {
  await write(join(dir, 'plugin.json'), json({
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name, version: '0.0.0', description: 'skraft host probe fixture',
    extensions: { 'com.github.copilot': {} },
  }))
  await write(join(dir, 'com.github.copilot', 'extensions', extension, 'copilot-extension.json'), json({ name: extension, version: 1 }))
  await write(join(dir, 'com.github.copilot', 'extensions', extension, 'extension.mjs'), source)
}

/** A plugin with a .claude-plugin manifest and its extension under extensions/. */
const claudePluginLayout = async (dir, name, extension, source) => {
  await write(join(dir, '.claude-plugin', 'plugin.json'), json({ name, version: '0.0.0', description: 'skraft host probe fixture' }))
  await write(join(dir, 'extensions', extension, 'extension.mjs'), source)
}

export const LAYOUTS = Object.freeze({ 'agent-plugins': agentPluginsLayout, 'claude-plugin': claudePluginLayout })

/** The two probe plugins, one per layout: suffix `a` (Agent Plugins) and `l` (.claude-plugin). */
export const writeProbePlugins = async (root) => {
  const agent = join(root, 'probe-agent-plugins')
  const legacy = join(root, 'probe-claude-plugin')
  await agentPluginsLayout(agent, 'skraft-probe-agent', 'skraft-probe-a', probeExtensionSource('a'))
  await claudePluginLayout(legacy, 'skraft-probe-legacy', 'skraft-probe-l', probeExtensionSource('l'))
  return { agent, legacy }
}

/** The two isolation plugins, in the layout that loaded. */
export const writeIsolationPlugins = async (root, layout) => {
  const broken = join(root, 'probe-broken-workflow')
  const badTool = join(root, 'probe-bad-tool')
  await LAYOUTS[layout](broken, 'skraft-probe-broken', 'skraft-probe-broken', brokenWorkflowSource)
  await LAYOUTS[layout](badTool, 'skraft-probe-badtool', 'skraft-probe-badtool', badToolSource)
  return { broken, badTool }
}

export const QUESTION_SLUG = 'probe-question'
export const QUESTION_KEY = 'adr-0'

/**
 * A working copy whose active pipeline waits on an ADR ratification, made with the engine
 * itself (Init, then the question event the `adr` node journals).
 */
export const writeQuestionRepo = async (dir, pluginRoot) => {
  await mkdir(dir, { recursive: true })
  const engine = (path) => import(pathToFileURL(join(pluginRoot, 'engine', path)).href)
  const { createNodeAdapters } = await engine('infrastructure/node-adapters.mjs')
  const { createInit } = await engine('application/pipeline/init-usecase.mjs')
  const { openJournal } = await engine('application/journal/run-journal.mjs')
  const adapters = createNodeAdapters({ cwd: dir, pluginRoot })
  const initialised = await createInit(adapters).init({ slug: QUESTION_SLUG })
  if (!initialised.ok) throw new Error(`fixture init refused: ${initialised.reason}`)
  const opened = await openJournal(adapters, QUESTION_SLUG)
  if (!opened.ok) throw new Error(`fixture journal: ${opened.reason}`)
  await opened.journal.append('question.asked', {
    key: QUESTION_KEY, kind: 'adr-ratification', text: 'Ratify the Proposed ADRs ADR-001?',
    options: ['RATIFIED', 'REJECTED'], refusals: ['REJECTED'], header: 'ADR', step: 'adr', visit: 1, subjects: ['ADR-001'],
  })
  return dir
}

/** The events of the question fixture's journal. */
export const questionEvents = async (dir) => {
  const { readFile } = await import('node:fs/promises')
  const text = await readFile(join(dir, '.copilot-tracking', 'skraft-plans', QUESTION_SLUG, 'events.jsonl'), 'utf8')
  return text.split(/\r?\n/).filter((line) => line !== '').map((line) => JSON.parse(line))
}
