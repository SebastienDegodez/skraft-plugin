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
  let snapshot = null
  try { snapshot = (await withTimeout(session.rpc.metadata.snapshot(), 5000))?.workingDirectory ?? null } catch (error) { snapshot = { error: messageOf(error) } }
  return JSON.stringify({ atLoad, processCwd: process.cwd(), tracked, snapshot, elicitation: session?.capabilities?.ui?.elicitation === true, mode, modeError })
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
      if (typeof ctx.args?.undeclaredPhase === 'string') {
        try { ctx.phase('Probe'); ctx.phase(ctx.args.undeclaredPhase); ctx.phase('Probe'); return { threw: false } } catch (error) { return { threw: true, error: messageOf(error) } }
      }
      ctx.phase('Probe')
      if (ctx.args?.throw === true) throw new Error('skraft-probe-sentinel')
      if (ctx.args?.agentCall) {
        try {
          const text = await withTimeout(ctx.agent(ctx.args.agentPrompt ?? 'Reply with the single word ok.', ctx.args.agentCall), 120000)
          return { threw: false, text: String(text ?? '') }
        } catch (error) {
          return { threw: true, error: messageOf(error) }
        }
      }
      if (ctx.args?.joinedConfirm === true) {
        const out = { elicitation: session?.capabilities?.ui?.elicitation === true }
        try { out.mode = await withTimeout(session.rpc.mode.get(), 5000) } catch (error) { out.modeError = messageOf(error) }
        try { out.value = await withTimeout(session.ui.confirm('skraft host probe: confirm() of the joined session from a workflow'), 60000) } catch (error) { out.error = messageOf(error) }
        return out
      }
      if (ctx.args?.joinedSelect === true) {
        const out = { elicitation: session?.capabilities?.ui?.elicitation === true }
        try { out.value = await withTimeout(session.ui.select('skraft host probe: select() of the joined session from a workflow', ['RATIFIED', 'REJECTED']), 60000) } catch (error) { out.error = messageOf(error) }
        return out
      }
      if (ctx.args?.joinedInput === true) {
        const out = { elicitation: session?.capabilities?.ui?.elicitation === true }
        try { out.value = await withTimeout(session.ui.input('skraft host probe: input() of the joined session from a workflow', { maxLength: 1000 }), 60000) } catch (error) { out.error = messageOf(error) }
        return out
      }
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

export const PROBE_CANVAS = 'skraft-probe-canvas'
/** The query string the probe canvas puts in the url its open gives, as the skraft canvas puts its token there. */
export const PROBE_CANVAS_QUERY = 't=skraft-probe-token'

/**
 * An extension that declares one canvas next to one tool. Its `open` starts a loopback server
 * whose page answers 200 and whose `POST /confirm` calls the joined session's `ui.confirm` from
 * outside any tool call; the tool reports what the canvas callbacks received. The SDK is
 * imported as a namespace: an SDK without `createCanvas` still loads the tool, and says so.
 */
export const probeCanvasSource = `// skraft host probe: a canvas (generated, throwaway)
import * as sdk from '@github/copilot-sdk/extension'
import { createServer } from 'node:http'

let session
const seen = { createCanvas: typeof sdk.createCanvas === 'function', opened: [], closed: [], actions: [] }
const servers = new Map()
const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])
const messageOf = (error) => String(error && error.message ? error.message : error)

const answer = async (req, res) => {
  if (req.method === 'POST' && req.url === '/confirm') {
    let value = null
    let error = null
    try { value = await withTimeout(session.ui.confirm('skraft host probe: confirm() from a canvas page'), 60000) } catch (failure) { error = messageOf(failure) }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ value, error }))
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end('<!doctype html><title>skraft probe canvas</title><p>skraft probe canvas</p>')
}

const serve = () => new Promise((resolve) => {
  const server = createServer((req, res) => { answer(req, res).catch(() => res.end()) })
  server.listen(0, '127.0.0.1', () => resolve(server))
})

const canvases = seen.createCanvas ? [sdk.createCanvas({
  id: '${PROBE_CANVAS}',
  displayName: 'skraft probe canvas',
  description: 'skraft host probe: a canvas that reports what it receives.',
  inputSchema: { type: 'object', properties: { tab: { type: 'string', enum: ['run', 'configuration', 'workflow'] } }, additionalProperties: false },
  actions: [{
    name: 'probe_state',
    description: 'skraft host probe: report what the canvas received.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async (ctx) => {
      seen.actions.push({ instanceId: ctx?.instanceId ?? null, actionName: ctx?.actionName ?? null })
      return { ok: true, opened: seen.opened.length }
    },
  }],
  open: async (ctx) => {
    seen.opened.push({ instanceId: ctx?.instanceId ?? null, hostCanvases: ctx?.host?.capabilities?.canvases ?? null, workingDirectory: ctx?.session?.workingDirectory ?? null, input: ctx?.input ?? null })
    const server = servers.get(ctx.instanceId) ?? await serve()
    servers.set(ctx.instanceId, server)
    return { url: 'http://127.0.0.1:' + server.address().port + '/?${PROBE_CANVAS_QUERY}' + (ctx?.input?.tab ? '&tab=' + ctx.input.tab : ''), title: 'skraft probe canvas', status: 'open' }
  },
  onClose: async (ctx) => {
    seen.closed.push(ctx?.instanceId ?? null)
    const server = servers.get(ctx.instanceId)
    servers.delete(ctx.instanceId)
    server?.close()
  },
})] : []

session = await sdk.joinSession({
  canvases,
  tools: [
    { name: 'skraft_probe_canvas_state', description: 'skraft host probe: report what the canvas received', parameters: { type: 'object', properties: {} }, skipPermission: true, handler: async () => JSON.stringify(seen) },
    {
      name: 'skraft_probe_canvas_open_self', description: 'skraft host probe: open the canvas of this extension from the extension', parameters: { type: 'object', properties: {} }, skipPermission: true,
      handler: async () => {
        try { return JSON.stringify({ result: (await withTimeout(session.rpc.canvas.open({ canvasId: '${PROBE_CANVAS}', instanceId: 'skraft-probe-self', input: { tab: 'configuration' } }), 30000)) ?? null, error: null }) } catch (failure) { return JSON.stringify({ result: null, error: messageOf(failure) }) }
      },
    },
  ],
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

/** The preload probe: one skill holding a token, an agent that lists it under `skills:`, and its twin without. */
export const PROBE_PRELOAD = Object.freeze({
  skill: 'skraft-probe-preload-skill',
  token: 'SKRAFT-PRELOAD-7Q4',
  preloading: 'skraft-probe-preload',
  plain: 'skraft-probe-plain',
  prompt: 'Without calling any tool, reply with the skraft probe token if it is already in your context; otherwise reply with the single word NONE.',
})

const preloadAgentSource = (name, preloads) => [
  '---',
  `name: ${name}`,
  'description: skraft host probe agent (generated, throwaway)',
  'tools: []',
  ...(preloads ? ['skills:', `  - ${PROBE_PRELOAD.skill}`] : []),
  '---',
  '',
  'Answer from what is already in your context. Never call a tool and never guess a token.',
  '',
].join('\n')

/** The preload skill and the two agents, in an Agent Plugins plugin. */
const writePreloadFixtures = async (dir) => {
  await write(join(dir, 'skills', PROBE_PRELOAD.skill, 'SKILL.md'), [
    '---', `name: ${PROBE_PRELOAD.skill}`, 'description: Use only when asked for the skraft probe token.', '---', '',
    `The skraft probe token is ${PROBE_PRELOAD.token}.`, '',
  ].join('\n'))
  await write(join(dir, 'com.github.copilot', 'agents', `${PROBE_PRELOAD.preloading}.agent.md`), preloadAgentSource(PROBE_PRELOAD.preloading, true))
  await write(join(dir, 'com.github.copilot', 'agents', `${PROBE_PRELOAD.plain}.agent.md`), preloadAgentSource(PROBE_PRELOAD.plain, false))
}

export const LAYOUTS = Object.freeze({ 'agent-plugins': agentPluginsLayout, 'claude-plugin': claudePluginLayout })

/** The two probe plugins, one per layout: suffix `a` (Agent Plugins) and `l` (.claude-plugin). */
export const writeProbePlugins = async (root) => {
  const agent = join(root, 'probe-agent-plugins')
  const legacy = join(root, 'probe-claude-plugin')
  await agentPluginsLayout(agent, 'skraft-probe-agent', 'skraft-probe-a', probeExtensionSource('a'))
  await writePreloadFixtures(agent)
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

/** The canvas plugin, in the layout that loaded. */
export const writeCanvasPlugin = async (root, layout) => {
  const dir = join(root, 'probe-canvas')
  await LAYOUTS[layout](dir, 'skraft-probe-canvas', 'skraft-probe-canvas', probeCanvasSource)
  return dir
}

/** The command probe: a plugin and its two commands, one named like the plugin and one not, and the text typed after the first. */
export const PROBE_COMMAND = Object.freeze({ plugin: 'skraft-probe-cmd', other: 'other', hint: 'probe hint', input: 'checkout #42 Pay by card --base develop' })

const commandSource = (description, hint) => [
  '---', `description: ${description}`, ...(hint ? [`argument-hint: ${hint}`] : []), '---', '',
  'skraft host probe command (generated, throwaway). Arguments: $ARGUMENTS', '',
].join('\n')

/** The command plugin: an Agent Plugins manifest and two commands under com.github.copilot/commands/, no extension. */
export const writeCommandPlugin = async (root) => {
  const dir = join(root, 'probe-command')
  await write(join(dir, 'plugin.json'), json({
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: PROBE_COMMAND.plugin, version: '0.0.0', description: 'skraft host probe fixture',
    extensions: { 'com.github.copilot': {} },
  }))
  await write(join(dir, 'com.github.copilot', 'commands', `${PROBE_COMMAND.plugin}.md`), commandSource('skraft host probe command named like its plugin', PROBE_COMMAND.hint))
  await write(join(dir, 'com.github.copilot', 'commands', `${PROBE_COMMAND.other}.md`), commandSource('skraft host probe command named otherwise'))
  return dir
}

export const QUESTION_SLUG = 'probe-question'
export const QUESTION_KEY = 'adr-0'

/**
 * A working copy whose active pipeline waits on an ADR ratification, made with the engine
 * itself (Init, then the question event the `adr` node journals). home: the home folder the
 * skraft extension reads, where the journal's signing key is kept.
 */
export const writeQuestionRepo = async (dir, pluginRoot, home) => {
  await mkdir(dir, { recursive: true })
  const engine = (path) => import(pathToFileURL(join(pluginRoot, 'engine', path)).href)
  const { createNodeAdapters } = await engine('infrastructure/node-adapters.mjs')
  const { createInit } = await engine('application/pipeline/init-usecase.mjs')
  const { openJournal } = await engine('application/journal/run-journal.mjs')
  const adapters = createNodeAdapters({ cwd: dir, pluginRoot, home })
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
