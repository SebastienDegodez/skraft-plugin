// A simulated Copilot SDK for the host probe: sessions, tools, workflows and elicitation behave
// as the issues the probe measures describe. The skraft extension is registered through the
// real register, so the skraft checks measure the driver as it is.
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { basename, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { register } from '../../../plugins/skraft-framework/engine/drivers/copilot-workflow/register.mjs'
import { PROBE_PRELOAD } from '../../../eng/host-probe/fixtures.mjs'

export const PLUGIN_ROOT = fileURLToPath(new URL('../../../plugins/skraft-framework/', import.meta.url))

/** The `models` of a skraft-config.json the probe checks, and the Copilot catalogue that has them all. */
export const CONFIGURED_MODELS = Object.freeze({ economy: { 'claude-code': { model: 'haiku' }, copilot: { model: 'copilot-small', effort: 'low' } }, standard: { copilot: { model: ['copilot-medium', 'copilot-medium-old'] } } })
const CATALOGUE = ['copilot-small', 'copilot-medium', 'copilot-medium-old']

/** What the simulated host throws for an unknown model and for an effort a model cannot take. */
export const REFUSALS = Object.freeze({ model: 'Model "skraft-probe-no-such-model" is not available. Available models: copilot-small', effort: 'Reasoning effort "max" is not supported for model "copilot-small"' })

/** What CLI 1.0.102-1 answers to every rpc.workflow.run of a session with no Copilot login. */
export const WORKFLOWS_UNAVAILABLE = 'Agent workflows are not available for this session'

/** What CLI 1.0.102-1 answers, with a login, to a run of a workflow no extension registered. */
export const notRegistered = (name) => `No workflow registered with name "${name}"`

/** The host's own tools, offered in every session. */
export const NATIVE_TOOLS = Object.freeze(['bash', 'view', 'edit'])

/**
 * @param {{ commands?: 'listed' | 'none' | 'duplicate', commandInput?: 'appended' | 'absent', hooksLog?: 'v1-rule' | 'silent' | 'every-plugin', preload?: 'preloads' | 'ignores' | 'everyone-knows', skraftLoads?: boolean, models?: string[], agents?: Array<{ id: string, name: string }>, refusals?: { model: string | null, effort: string | null }, staleSnapshot?: boolean, nativeTools?: string[], workflowRunError?: string | null, refuseCanvases?: boolean, canvasConfirmUnheard?: boolean, refuseCanvasOpen?: boolean, joinedElicitation?: boolean, dropCanvasQuery?: boolean, reopenFocusesOnly?: boolean, askedUnanswered?: boolean, undeclaredPhase?: 'listed' | 'throws' | 'ignored' | 'shifts' | 'forgets', mcpClient?: string | null, incidentModel?: 'reads' | 'guesses' }} [host]
 *   commands: whether the plugins' com.github.copilot/commands/*.md files are listed (named by the plugin name rule),
 *   not listed, or listed twice; commandInput: whether a command's typed input reaches its prompt;
 *   hooksLog: what the runtime writes under a client's baseDirectory/logs when a session loads plugins: v1-rule applies
 *   what CLI 1.0.106-8 does to each plugin's real files (HOOKS_RULE below), silent writes nothing, every-plugin writes
 *   the error of a hooks manifest at the root for every plugin, whatever its files;
 *   refusals: what ctx.agent throws, null when it accepts the call; staleSnapshot: metadata.snapshot
 *   keeps the first working directory after a change; nativeTools: the host's own tools;
 *   workflowRunError: what every rpc.workflow.run throws, as a host with no login does (WORKFLOWS_UNAVAILABLE);
 *   refuseCanvases: the host refuses a join that carries a canvas, so nothing of that join registers;
 *   canvasConfirmUnheard: a confirmation asked from a canvas page never reaches the host's handler;
 *   refuseCanvasOpen: rpc.canvas.open throws; joinedElicitation: false when the session an extension
 *   joined declares no elicitation, whatever the host's handler; dropCanvasQuery: the url
 *   rpc.canvas.open gives back loses its query string; reopenFocusesOnly: rpc.canvas.open on an
 *   instance already open gives its snapshot back without calling the canvas's open; askedUnanswered: select and input reach the
 *   host's handler, but its answer never comes back (null); undeclaredPhase: what ctx.phase does with a
 *   title meta.phases does not declare (listed with no ordinal, throws, dropped, shifts: the declared phase opened after it loses its ordinal, or forgets: it is left out of the run detail);
 *   mcpClient: the clientInfo.name the host gives the servers it starts from a plugin's mcp.json, null when it starts none
 */
export const simulatedSdk = ({ preload = 'ignores', skraftLoads = true, models = CATALOGUE, agents, refusals = REFUSALS, staleSnapshot = false, home, nativeTools = NATIVE_TOOLS, workflowRunError = null, refuseCanvases = false, canvasConfirmUnheard = false, refuseCanvasOpen = false, joinedElicitation = true, dropCanvasQuery = false, reopenFocusesOnly = false, askedUnanswered = false, undeclaredPhase = 'listed', commands = 'listed', commandInput = 'appended', mcpClient = 'GitHub Copilot CLI', hooksLog = 'v1-rule', incidentModel = 'reads' } = {}) => {
  class CopilotClient {
    constructor(options = {}) { this.baseDirectory = options.baseDirectory }
    async start() {}
    async stop() { return [] }
    async listModels() { return models.map((id) => ({ id, name: id, capabilities: {} })) }
    async createSession(config) {
      if (this.baseDirectory !== undefined) logHooksErrors(this.baseDirectory, config.pluginDirectories ?? [], hooksLog)
      return simulatedSession(config, { preload, skraftLoads, agents, refusals, models, staleSnapshot, home, nativeTools, workflowRunError, refuseCanvases, canvasConfirmUnheard, refuseCanvasOpen, joinedElicitation, dropCanvasQuery, reopenFocusesOnly, askedUnanswered, undeclaredPhase, commands, commandInput, mcpClient, incidentModel }).ready
    }
  }
  return { CopilotClient, approveAll: () => ({ kind: 'approve-once' }) }
}

const V1_SCHEMA = /^https:\/\/agent-plugins\.org\/schemas\/1\./
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const manifestOf = (dir) => existsSync(join(dir, 'plugin.json')) ? readJson(join(dir, 'plugin.json')) : {}
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

const rootHooksIgnored = (name) => `Plugin "${name}" declares the Agent Plugins v1 $schema, so its hooks are read only from "com.github.copilot/hooks/hooks.json". "hooks/hooks.json" at the plugin root is no longer read; move it there.`
const hooksNotAnObject = (name, path) => `[plugin-source "${name}"] Invalid hooks config for plugin "${name}" at "${path}": hooks: hooks must be an object`

/**
 * HOOKS_RULE, as measured on the CLI 1.0.106-8 runtime (2026-11-11): a plugin that declares the Agent Plugins v1
 * schema has its hooks read only from com.github.copilot/hooks/hooks.json. A file there with no `hooks` object is
 * an error; no file there and a hooks/hooks.json at the root is another; a `hooks` object, even empty, is silent.
 */
const hooksErrorsOf = (dir) => {
  const manifest = manifestOf(dir)
  if (!V1_SCHEMA.test(manifest.$schema ?? '')) return []
  const namespaced = join(dir, 'com.github.copilot', 'hooks', 'hooks.json')
  if (existsSync(namespaced)) return isObject(readJson(namespaced).hooks) ? [] : [hooksNotAnObject(manifest.name, namespaced)]
  return existsSync(join(dir, 'hooks', 'hooks.json')) ? [rootHooksIgnored(manifest.name)] : []
}

const hooksLines = (dirs, mode) => {
  if (mode === 'silent') return []
  if (mode === 'every-plugin') return dirs.map((dir) => rootHooksIgnored(manifestOf(dir).name ?? basename(dir)))
  return dirs.flatMap(hooksErrorsOf)
}

/** The runtime's process log under the client's baseDirectory, a timestamp in front of each line as in a real log. */
const logHooksErrors = (home, dirs, mode) => {
  const lines = hooksLines(dirs, mode)
  if (lines.length === 0) return
  mkdirSync(join(home, 'logs'), { recursive: true })
  appendFileSync(join(home, 'logs', 'process-simulated.log'), lines.map((line) => `${new Date().toISOString()} [ERROR] [rust:hooks] ${line}\n`).join(''))
}

const simulatedSession = (config, { preload, skraftLoads, agents, refusals, models, staleSnapshot, home, nativeTools, workflowRunError, refuseCanvases, canvasConfirmUnheard, refuseCanvasOpen, joinedElicitation, dropCanvasQuery, reopenFocusesOnly, askedUnanswered, undeclaredPhase, commands: commandsHost, commandInput, mcpClient, incidentModel }) => {
  const atLoad = config.workingDirectory
  let mode = 'interactive'
  let tracked = null
  const elicitation = typeof config.onElicitationRequest === 'function'
  const confirm = async (message) => {
    if (!elicitation) throw new Error('Elicitation is not supported by the host')
    const result = await config.onElicitationRequest({ message, requestedSchema: { type: 'object', properties: { confirmed: { type: 'boolean' } } } })
    return result.action === 'accept' && result.content?.confirmed === true
  }
  /** select and input as SDK 1.0.102-1 builds them: one elicitation field, its value or null. */
  const elicited = async (message, field, property) => {
    if (!elicitation) throw new Error('Elicitation is not supported by the host')
    const result = await config.onElicitationRequest({ message, requestedSchema: { type: 'object', properties: { [field]: property }, required: [field] } })
    return result.action === 'accept' && result.content?.[field] != null && !askedUnanswered ? result.content[field] : null
  }
  const select = (message, options) => elicited(message, 'selection', { type: 'string', enum: options })
  const input = (message, options = {}) => elicited(message, 'value', { type: 'string', ...options })
  const tools = new Map([...nativeTools, ...(config.requestCanvasRenderer ? CANVAS_AGENT_TOOLS : [])].map((name) => [name, async () => name]))
  const canvases = simulatedCanvases({ refuseOpen: refuseCanvasOpen, dropQuery: dropCanvasQuery, reopenFocusesOnly })
  const workflows = new Map()
  const listeners = []
  const joined = {
    capabilities: { ui: { elicitation: elicitation && joinedElicitation } },
    ui: { confirm, select, input },
    rpc: { mode: { get: async () => mode }, metadata: { snapshot: async () => ({ workingDirectory: tracked ?? atLoad }) } },
    log: async () => undefined,
  }
  /** The skraft extension, joined through the real register, its canvas declared unless the host refuses canvases. */
  const joinSkraft = (dir) => register({
    defineWorkflow: (definition) => definition,
    createCanvas: (options) => options,
    CanvasError: SimulatedCanvasError,
    joinSession: async ({ onEvent, workflows: defined, tools: offered, canvases: declared = [] }) => {
      if (refuseCanvases && declared.length > 0) throw new Error('canvas refused')
      listeners.push(onEvent)
      for (const tool of offered) tools.set(tool.name, (args) => tool.handler(args))
      for (const workflow of defined) workflows.set(workflow.meta.name, { body: workflow.run, declared: workflow.meta.phases.map(({ title }) => title) })
      for (const canvas of declared) canvases.declare(asDeclared(canvas))
      return joined
    },
    pluginRoot: dir, home: home ?? `${atLoad}-home`,
  })
  const joins = []
  for (const dir of config.pluginDirectories) {
    const name = basename(dir)
    if (name === 'probe-agent-plugins' || name === 'probe-claude-plugin') addProbe(name === 'probe-agent-plugins' ? 'a' : 'l')
    if (name === 'skraft-framework' && skraftLoads) joins.push(joinSkraft(dir))
    if (name === 'probe-canvas' && !refuseCanvases) addProbeCanvas()
    // probe-broken-workflow: defineWorkflow throws at import, so nothing registers.
    // probe-bad-tool: the host refuses the join, so nothing registers.
  }

  function addProbe(suffix) {
    tools.set(`skraft_probe_state_${suffix}`, async () => JSON.stringify({ atLoad, processCwd: atLoad, tracked, snapshot: staleSnapshot ? atLoad : tracked ?? atLoad, elicitation, mode }))
    tools.set(`skraft_probe_confirm_${suffix}`, async () => {
      try { return JSON.stringify({ value: await confirm('probe') }) } catch (error) { return JSON.stringify({ error: error.message }) }
    })
    workflows.set(`skraft-probe-${suffix}`, { declared: ['Probe'], body: async (ctx) => {
      if (typeof ctx.args?.undeclaredPhase === 'string') return undeclared(ctx)
      ctx.phase('Probe')
      if (ctx.args?.throw === true) throw new Error('skraft-probe-sentinel')
      if (ctx.args?.agentCall) return agentCall(ctx.args.agentCall)
      if (ctx.args?.confirm === true) return { hasSession: true, elicitation, value: await confirm('probe') }
      if (ctx.args?.joinedConfirm === true) return { elicitation, mode, value: await confirm('probe') }
      if (ctx.args?.joinedSelect === true) return { elicitation, value: await select('probe', ['RATIFIED', 'REJECTED']) }
      if (ctx.args?.joinedInput === true) return { elicitation, value: await input('probe', { maxLength: 1000 }) }
      return { processCwd: atLoad, tracked }
    } })
  }

  function undeclared(ctx) {
    try { ctx.phase('Probe'); ctx.phase(ctx.args.undeclaredPhase); ctx.phase('Probe') } catch (error) { return { threw: true, error: error.message } }
    return { threw: false }
  }

  /** The canvas fixture: a canvas whose open starts a loopback page, next to the tool that reports it. */
  function addProbeCanvas() {
    const seen = { createCanvas: true, opened: [], closed: [], actions: [] }
    tools.set('skraft_probe_canvas_state', async () => JSON.stringify(seen))
    canvases.declare({
      declaration: { id: 'skraft-probe-canvas', displayName: 'skraft probe canvas', actions: [{ name: 'probe_state' }] },
      open: async (ctx) => {
        seen.opened.push({ instanceId: ctx.instanceId, hostCanvases: null, workingDirectory: tracked ?? atLoad, input: ctx.input ?? null })
        return { url: (await canvases.page(ctx.instanceId, canvasConfirmUnheard ? async () => false : confirm)).url + (ctx.input?.tab ? `&tab=${ctx.input.tab}` : ''), title: 'skraft probe canvas', status: 'open' }
      },
      onClose: async (ctx) => { seen.closed.push(ctx.instanceId); await canvases.closePage(ctx.instanceId) },
      actions: { probe_state: async (ctx) => { seen.actions.push({ instanceId: ctx.instanceId, actionName: 'probe_state' }); return { ok: true, opened: seen.opened.length } } },
    })
  }

  function agentCall({ model, reasoningEffort, agent }) {
    if (agent !== undefined) return { threw: false, text: knowsToken(agent) ? `The token is ${PROBE_PRELOAD.token}.` : 'NONE' }
    const refused = !models.includes(model) ? refusals.model : reasoningEffort === 'max' ? refusals.effort : null
    return refused === null ? { threw: false, text: 'ok' } : { threw: true, error: refused }
  }

  function knowsToken(agent) {
    if (preload === 'everyone-knows') return true
    return preload === 'preloads' && agent.endsWith(`:${PROBE_PRELOAD.preloading}`)
  }

  let runs = 0
  const runPhases = new Map()
  const rpc = {
    tools: {
      initializeAndValidate: async () => ({}),
      getCurrentMetadata: async () => ({ tools: [...tools.keys()].map((name) => ({ name, description: name })) }),
      execute: async ({ name, arguments: args }) => {
        const handler = tools.get(name)
        if (!handler) throw new Error(`unknown tool ${name}`)
        return { textResultForLlm: await handler(args), resultType: 'success' }
      },
    },
    workflow: {
      run: async ({ name, args }) => {
        if (workflowRunError !== null) throw new Error(workflowRunError)
        const found = workflows.get(name)
        const runId = `run-${++runs}`
        if (!found) throw new Error(notRegistered(name))
        const phases = simulatedPhases(found.declared, undeclaredPhase)
        runPhases.set(runId, phases)
        try {
          return { runId, status: 'completed', result: await found.body({ args, log: () => undefined, phase: phases.enter, session: { ui: { confirm } }, signal: new AbortController().signal }) }
        } catch (error) {
          return { runId, status: 'error', error: error.message }
        }
      },
      getRunDetail: async ({ runId }) => runPhases.get(runId)?.detail() ?? Promise.reject(new Error(`No workflow run ${runId}`)),
      getRun: async ({ runId }) => ({ runId, status: 'completed' }),
    },
    metadata: {
      setWorkingDirectory: async ({ workingDirectory }) => {
        if (!isAbsolute(workingDirectory)) throw new Error('not absolute')
        tracked = workingDirectory
        for (const onEvent of listeners) onEvent({ type: 'session.context_changed', data: { cwd: workingDirectory } })
        return { workingDirectory }
      },
    },
    mode: { get: async () => mode, set: async ({ mode: next }) => { mode = next; return mode } },
    extensions: { list: async () => ({ extensions: [] }) },
    agent: { list: async () => ({ agents: agents ?? [...defaultAgents(), ...probeAgents()] }) },
    ...simulatedCommands(config.pluginDirectories, { commands: commandsHost, commandInput }),
    mcp: simulatedMcp(config, mcpClient),
  }
  rpc.canvas = canvases.rpc
  const watchers = new Set()
  const emit = (type, data) => { for (const watcher of watchers) watcher({ type, data }) }
  const call = async (toolName, args) => {
    emit('tool.execution_start', { toolName, arguments: args })
    return (await rpc.tools.execute({ name: toolName, arguments: args })).textResultForLlm
  }
  const session = {
    rpc, disconnect: async () => { await canvases.closeAll() },
    on: (type, handler) => {
      const watcher = typeof type === 'function' ? type : (event) => { if (event.type === type) handler(event) }
      watchers.add(watcher)
      return () => watchers.delete(watcher)
    },
    sendAndWait: async () => ({ data: { content: await scriptedIncidentModel(call, emit, incidentModel) } }),
  }
  return { ready: Promise.all(joins).then(() => session) }
}

/**
 * The phases of one simulated run as `session.rpc.workflow.getRunDetail` lists them (SDK 1.0.105
 * typings): each declared title with its ordinal, each undeclared one entered with a null ordinal.
 * `mode` says what the host does with an undeclared title: `shifts` lists it, and gives no ordinal
 * to a declared title entered after it; `forgets` lists it, and drops a declared title entered after it.
 */
const simulatedPhases = (declared, mode) => {
  const entered = []
  const undeclaredAt = () => entered.findIndex((name) => !declared.includes(name))
  const isKept = (title) => (declared.includes(title) ? !(mode === 'forgets' && undeclaredAt() !== -1) : ['listed', 'shifts', 'forgets'].includes(mode))
  const enter = (title) => {
    if (!declared.includes(title) && mode === 'throws') throw new Error(`phase "${title}" is not declared`)
    if (isKept(title)) entered.push(title)
  }
  const listed = (title, ordinal) => ({ title, ordinal, status: 'completed', entryCount: entered.filter((name) => name === title).length })
  const afterUndeclared = (title) => mode === 'shifts' && undeclaredAt() !== -1 && undeclaredAt() < entered.lastIndexOf(title)
  const detail = async () => ({
    phases: [...declared.map((title, index) => listed(title, afterUndeclared(title) ? null : index)), ...[...new Set(entered.filter((title) => !declared.includes(title)))].map((title) => listed(title, null))],
    currentPhase: entered.at(-1) ?? null, declaredPhaseCount: declared.length,
  })
  return { enter, detail }
}

/**
 * The model of a simulated session that is asked to settle a pending incident question: it reads
 * the question, then reads the output file it names (`reads`) or not (`guesses`), records ABORT,
 * and quotes the identifier it found.
 */
const scriptedIncidentModel = async (call, emit, behaviour) => {
  const { question } = JSON.parse(await call('skraft_decide', {}))
  const log = /^Output: (.+)$/m.exec(question.text)[1]
  if (behaviour === 'reads') emit('tool.execution_start', { toolName: 'view', arguments: { path: log } })
  const found = behaviour === 'reads' ? /Error: ([^:]+):/.exec(readFileSync(log, 'utf8'))[1] : 'unknown'
  await call('skraft_decide', { key: question.key, answer: 'ABORT' })
  emit('assistant.usage', { model: 'simulated', inputTokens: 10, outputTokens: 5, cost: 1, copilotUsage: { totalNanoAiu: 42 } })
  return `${found} ABORT`
}

/** The two preload probe agents the Agent Plugins probe fixture declares. */
const probeAgents = () => [PROBE_PRELOAD.preloading, PROBE_PRELOAD.plain].map((name) => ({ id: `skraft-probe-agent:${name}`, name }))

const defaultAgents = () => readdirSync(join(PLUGIN_ROOT, 'com.github.copilot', 'agents'))
  .filter((name) => name.endsWith('.agent.md'))
  .map((name) => name.replace(/\.agent\.md$/, ''))
  .map((id) => ({ id: `skraft:${id}`, name: id }))

/** The canvas agent tools a session offers with requestCanvasRenderer (CLI 1.0.102-1). */
const CANVAS_AGENT_TOOLS = Object.freeze(['list_canvas_capabilities', 'open_canvas', 'invoke_canvas_action'])

/**
 * The canvases of one session: each declared canvas, its open instances, and the loopback page a
 * probe canvas serves, whose POST /confirm asks the session to confirm.
 */
const simulatedCanvases = ({ refuseOpen, dropQuery, reopenFocusesOnly }) => {
  const declared = new Map()
  const instances = new Map()
  const pages = new Map()
  const instance = (instanceId) => {
    const found = instances.get(instanceId)
    if (!found) throw new Error(`No open canvas instance ${instanceId}`)
    return found
  }
  const rpc = {
    list: async () => ({ canvases: [...declared.values()].map(({ declaration }) => ({ canvasId: declaration.id, displayName: declaration.displayName, actions: declaration.actions ?? [] })) }),
    listOpen: async () => ({ openCanvases: [...instances.values()].map(({ snapshot }) => snapshot) }),
    open: async ({ canvasId, instanceId, input }) => {
      if (refuseOpen) throw new Error('Canvas rendering is not available')
      if (reopenFocusesOnly && instances.has(instanceId)) return instances.get(instanceId).snapshot
      const canvas = declared.get(canvasId)
      if (!canvas) throw new Error(`Unknown canvas ${canvasId}`)
      const result = await canvas.open({ canvasId, instanceId, input, session: {} })
      const snapshot = { instanceId, canvasId, ...result, ...(dropQuery ? { url: result.url.split('?')[0] } : {}), input }
      instances.set(instanceId, { canvas, snapshot })
      return snapshot
    },
    close: async ({ instanceId }) => {
      const { canvas } = instance(instanceId)
      instances.delete(instanceId)
      await canvas.onClose?.({ instanceId })
    },
    action: { invoke: async ({ instanceId, actionName, input }) => ({ result: await instance(instanceId).canvas.actions[actionName]({ instanceId, actionName, input }) }) },
  }
  const page = async (instanceId, confirm) => {
    if (pages.has(instanceId)) return pages.get(instanceId)
    const server = createServer(async (req, res) => {
      if (req.method === 'POST' && req.url === '/confirm') return res.end(JSON.stringify({ value: await confirm('probe canvas'), error: null }))
      res.end('<!doctype html><title>probe</title>')
    })
    await new Promise((done) => server.listen(0, '127.0.0.1', done))
    const served = { server, url: `http://127.0.0.1:${server.address().port}/?t=skraft-probe-token` }
    pages.set(instanceId, served)
    return served
  }
  const closePage = async (instanceId) => {
    const served = pages.get(instanceId)
    pages.delete(instanceId)
    if (served) await new Promise((done) => served.server.close(done))
  }
  return {
    rpc, page, closePage,
    declare: (canvas) => declared.set(canvas.declaration.id, canvas),
    closeAll: async () => { for (const instanceId of [...pages.keys()]) await closePage(instanceId) },
  }
}

/** The SDK's CanvasError. */
class SimulatedCanvasError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/** A canvas as createCanvas's options give it: its declaration, its callbacks, its actions by name. */
const asDeclared = (options) => ({
  declaration: { id: options.id, displayName: options.displayName, actions: (options.actions ?? []).map(({ name }) => ({ name })) },
  open: options.open,
  onClose: options.onClose,
  actions: Object.fromEntries((options.actions ?? []).map((action) => [action.name, action.handler])),
})

/** The name a plugin command gets: bare when it is the plugin's own name, else `<plugin>:<command>`. */
const commandName = (plugin, file) => (plugin === file ? file : `${plugin}:${file}`)

/** The commands the session's plugins ship under com.github.copilot/commands/, as `rpc.commands` and `rpc.skills` show them. */
const pluginCommands = (pluginDirectories) => pluginDirectories.flatMap((dir) => {
  const folder = join(dir, 'com.github.copilot', 'commands')
  if (!existsSync(folder)) return []
  const plugin = JSON.parse(readFileSync(join(dir, 'plugin.json'), 'utf8')).name
  return readdirSync(folder).filter((name) => name.endsWith('.md')).sort().map((name) => {
    const file = name.replace(/\.md$/, '')
    const text = readFileSync(join(folder, name), 'utf8')
    return { plugin, file, name: commandName(plugin, file), hint: /^argument-hint:\s*(.*)$/m.exec(text)?.[1] ?? '', body: text.replace(/^---[\s\S]*?---\r?\n/, '') }
  })
})

/** `rpc.commands.list`, `rpc.commands.invoke` and `rpc.skills.list`, as CLI 1.0.105 types them. */
const simulatedCommands = (pluginDirectories, { commands, commandInput }) => {
  const found = commands === 'none' ? [] : pluginCommands(pluginDirectories)
  const listed = commands === 'duplicate' ? [...found, ...found.filter((item) => item.plugin === item.file)] : found
  return {
    commands: {
      list: async () => ({ commands: [{ name: 'help', description: 'help', kind: 'builtin', allowDuringAgentExecution: true }, ...listed.map((item) => ({ name: item.name, description: item.file, kind: 'skill', input: { hint: item.hint }, allowDuringAgentExecution: false }))] }),
      invoke: async ({ name, input }) => {
        const item = found.find((candidate) => candidate.name === name.replace(/^\//, ''))
        if (!item) throw new Error(`Unknown command: ${name}`)
        const prompt = commandInput === 'appended' ? `${item.body}\n\n${input ?? ''}` : item.body
        return { kind: 'agent-prompt', prompt, displayPrompt: `/${item.name}` }
      },
    },
    skills: { list: async () => ({ skills: found.map((item) => ({ name: item.file, description: item.file, source: 'plugin', userInvocable: true, enabled: true, pluginName: item.plugin, argumentHint: item.hint })) }) },
  }
}

/** The MCP servers the plugins declare in mcp.json, `${PLUGIN_ROOT}` replaced, as one host plugin would start them. */
const declaredServers = (pluginDirectories) => pluginDirectories
  .filter((dir) => existsSync(join(dir, 'mcp.json')))
  .flatMap((dir) => Object.entries(JSON.parse(readFileSync(join(dir, 'mcp.json'), 'utf8')).mcpServers ?? {})
    .map(([name, server]) => ({ name, plugin: basename(dir), command: server.command, args: server.args.map((arg) => arg.replaceAll('${PLUGIN_ROOT}', dir)) })))

/** `rpc.mcp.list` and `rpc.mcp.listTools`, as SDK 1.0.104 types them; listTools starts the real server and asks it. */
const simulatedMcp = (config, clientName) => {
  const servers = clientName === null ? [] : declaredServers(config.pluginDirectories)
  return {
    list: async () => ({ servers: servers.map(({ name, plugin }) => ({ name, status: 'connected', sourcePlugin: plugin })) }),
    listTools: async ({ serverName }) => {
      const server = servers.find(({ name }) => name === serverName)
      if (!server) throw new Error(`MCP server ${serverName} is not connected`)
      return { tools: (await askServer(server, config.workingDirectory, clientName)).map(({ name }) => ({ name, installationId: server.plugin })) }
    },
  }
}

/** Starts a stdio MCP server, initializes it under `clientName`, lists its tools and closes it. */
const askServer = ({ command, args }, cwd, clientName) => new Promise((done, failed) => {
  const child = spawn(command === 'node' ? process.execPath : command, args, { cwd, stdio: ['pipe', 'pipe', 'ignore'] })
  let buffer = ''
  child.on('error', failed)
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    const answer = buffer.split('\n').filter(Boolean).map((line) => JSON.parse(line)).find((message) => message.id === 2)
    if (answer) { child.stdin.end(); done(answer.result?.tools ?? []) }
  })
  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`)
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: clientName, version: '0' } } })
  send({ jsonrpc: '2.0', method: 'notifications/initialized' })
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
})
