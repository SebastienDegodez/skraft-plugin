// A simulated Copilot SDK for the host probe: sessions, tools, workflows and elicitation behave
// as the issues the probe measures describe. The skraft extension is registered through the
// real register, so the skraft checks measure the driver as it is.
import { readdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { basename, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { register } from '../../../plugins/skraft-framework/engine/drivers/copilot-workflow/register.mjs'
import { GITHUB_MCP_SERVER, PROBE_MCP, PROBE_PRELOAD, PROBE_UNDECLARED_PHASE } from '../../../eng/host-probe/fixtures.mjs'

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
 * @param {{ preload?: 'preloads' | 'ignores' | 'everyone-knows', skraftLoads?: boolean, models?: string[], agents?: Array<{ id: string, name: string }>, refusals?: { model: string | null, effort: string | null }, staleSnapshot?: boolean, nativeTools?: string[], workflowRunError?: string | null, refuseCanvases?: boolean, canvasConfirmUnheard?: boolean, refuseCanvasOpen?: boolean, joinedElicitation?: boolean, dropCanvasQuery?: boolean, reopenFocusesOnly?: boolean, askedUnanswered?: boolean, undeclaredPhase?: 'listed' | 'throws' | 'dropped', mcp?: SimulatedMcp }} [host]
 *   refusals: what ctx.agent throws, null when it accepts the call; staleSnapshot: metadata.snapshot
 *   keeps the first working directory after a change; nativeTools: the host's own tools;
 *   workflowRunError: what every rpc.workflow.run throws, as a host with no login does (WORKFLOWS_UNAVAILABLE);
 *   refuseCanvases: the host refuses a join that carries a canvas, so nothing of that join registers;
 *   canvasConfirmUnheard: a confirmation asked from a canvas page never reaches the host's handler;
 *   refuseCanvasOpen: rpc.canvas.open throws; joinedElicitation: false when the session an extension
 *   joined declares no elicitation, whatever the host's handler; dropCanvasQuery: the url
 *   rpc.canvas.open gives back loses its query string; reopenFocusesOnly: rpc.canvas.open on an
 *   instance already open gives its snapshot back without calling the canvas's open; askedUnanswered: select and input reach the
 *   host's handler, but its answer never comes back (null); mcp: how the session's MCP servers
 *   depart from what CLI 1.0.102-1 does (SimulatedMcp); undeclaredPhase: what the host does with a
 *   ctx.phase title meta.phases did not declare: lists it (ordinal null), throws, or leaves it out of getRunDetail
 */
export const simulatedSdk = ({ preload = 'ignores', skraftLoads = true, models = CATALOGUE, agents, refusals = REFUSALS, staleSnapshot = false, home, nativeTools = NATIVE_TOOLS, workflowRunError = null, refuseCanvases = false, canvasConfirmUnheard = false, refuseCanvasOpen = false, joinedElicitation = true, dropCanvasQuery = false, reopenFocusesOnly = false, askedUnanswered = false, undeclaredPhase = 'listed', mcp = {} } = {}) => {
  class CopilotClient {
    async start() {}
    async stop() { return [] }
    async listModels() { return models.map((id) => ({ id, name: id, capabilities: {} })) }
    async createSession(config) {
      if (mcp.refusesConfig && config.mcpServers) throw new Error('mcpServers is not supported')
      return simulatedSession(config, { preload, skraftLoads, agents, refusals, models, staleSnapshot, home, nativeTools, workflowRunError, refuseCanvases, canvasConfirmUnheard, refuseCanvasOpen, joinedElicitation, dropCanvasQuery, reopenFocusesOnly, askedUnanswered, undeclaredPhase, mcp }).ready
    }
  }
  return { CopilotClient, approveAll: () => ({ kind: 'approve-once' }) }
}

const simulatedSession = (config, { preload, skraftLoads, agents, refusals, models, staleSnapshot, home, nativeTools, workflowRunError, refuseCanvases, canvasConfirmUnheard, refuseCanvasOpen, joinedElicitation, dropCanvasQuery, reopenFocusesOnly, askedUnanswered, undeclaredPhase, mcp: mcpHost }) => {
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
  const mcp = simulatedMcp(config, mcpHost)
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
      for (const workflow of defined) workflows.set(workflow.meta.name, workflow.run)
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
    workflows.set(`skraft-probe-${suffix}`, async (ctx) => {
      ctx.phase('Probe')
      if (ctx.args?.undeclaredPhase === true) return undeclared(ctx)
      if (ctx.args?.throw === true) throw new Error('skraft-probe-sentinel')
      if (ctx.args?.mcp === true) return mcp.seen()
      if (ctx.args?.agentCall) return agentCall(ctx.args.agentCall)
      if (ctx.args?.confirm === true) return { hasSession: true, elicitation, value: await confirm('probe') }
      if (ctx.args?.joinedConfirm === true) return { elicitation, mode, value: await confirm('probe') }
      if (ctx.args?.joinedSelect === true) return { elicitation, value: await select('probe', ['RATIFIED', 'REJECTED']) }
      if (ctx.args?.joinedInput === true) return { elicitation, value: await input('probe', { maxLength: 1000 }) }
      return { processCwd: atLoad, tracked }
    })
  }

  /** The canvas fixture: a canvas whose open starts a loopback page, next to the tool that reports it. */
  function addProbeCanvas() {
    const seen = { createCanvas: true, opened: [], closed: [], actions: [] }
    tools.set('skraft_probe_canvas_state', async () => JSON.stringify(seen))
    tools.set('skraft_probe_canvas_open_self', async () => {
      try {
        return JSON.stringify({ result: await canvases.rpc.open({ canvasId: 'skraft-probe-canvas', instanceId: 'skraft-probe-self', input: { tab: 'configuration' } }), error: null })
      } catch (failure) {
        return JSON.stringify({ result: null, error: failure.message })
      }
    })
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

  const undeclared = (ctx) => {
    try { ctx.phase(PROBE_UNDECLARED_PHASE); return { threw: false } } catch (error) { return { threw: true, error: error.message } }
  }
  let runs = 0
  const phasesOf = new Map()
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
        const body = workflows.get(name)
        const runId = `run-${++runs}`
        if (!body) throw new Error(notRegistered(name))
        const phases = []
        phasesOf.set(runId, phases)
        const phase = (title) => {
          if (undeclaredPhase === 'throws' && title !== 'Probe') throw new Error(`unknown phase ${title}`)
          phases.push(title)
        }
        try {
          return { runId, status: 'completed', result: await body({ args, log: () => undefined, phase, session: { ui: { confirm } }, signal: new AbortController().signal }) }
        } catch (error) {
          return { runId, status: 'error', error: error.message }
        }
      },
      getRun: async ({ runId }) => ({ runId, status: 'completed' }),
      getRunDetail: async ({ runId }) => ({
        runId, declaredPhaseCount: 1,
        phases: (phasesOf.get(runId) ?? []).filter((title) => undeclaredPhase !== 'dropped' || title === 'Probe')
          .map((title) => ({ id: title, title, ordinal: title === 'Probe' ? 0 : null, status: 'completed' })),
      }),
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
  }
  rpc.canvas = canvases.rpc
  const session = { rpc, disconnect: async () => { await canvases.closeAll() } }
  return { ready: Promise.all(joins).then(() => session) }
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

/**
 * How a simulated session's MCP servers depart from CLI 1.0.102-1, one way each.
 * @typedef {{
 *   reachable?: boolean, listedStatus?: string, listedTools?: string[], echoText?: string,
 *   asksReadOnly?: boolean, firstUnasked?: boolean, rejectsUnasked?: boolean, ignoresReject?: boolean,
 *   touchFails?: boolean, failingStatus?: string, absentServerError?: string, absentToolThrows?: boolean,
 *   errorAsSuccess?: boolean, withoutFailTool?: boolean, githubTools?: number | null, githubStatus?: string, refusesConfig?: boolean,
 * }} SimulatedMcp
 *   reachable: false when the joined session has no `rpc.mcp` and offers no MCP tool; listedStatus:
 *   the probe server's status in `mcp.list` (its tools still answer); listedTools: what `listTools`
 *   names for it; echoText: what `echo` answers; asksReadOnly: the read-only tools ask permission too;
 *   firstUnasked: the first call of a side-effect tool runs without asking; rejectsUnasked: from the
 *   second such call on, the host rejects it without asking; ignoresReject: a rejected call runs
 *   anyway; touchFails: an approved `touch` fails; failingStatus: the dying server's status;
 *   absentServerError: what `listTools` of an absent server throws; absentToolThrows: executing an
 *   absent tool throws instead of failing; errorAsSuccess: a tool error comes back as a success; withoutFailTool: the probe server offers no `fail`;
 *   githubTools: a `github-mcp-server` with that many tools, none when null; githubStatus: its
 *   status in `mcp.list` (its tools still answer); refusesConfig: `createSession` with `mcpServers` throws.
 */

/**
 * The session's MCP servers as CLI 1.0.102-1 gives them to an extension inside a workflow run
 * (docs/v2/host-verification.md, 2026-10-30): each configured server connected with its tools,
 * the probe's failing one `failed` with its error; an MCP tool offered as `<server>-<tool>`; a
 * tool without `readOnlyHint` put to the host's permission handler first; a tool error a
 * `failure`. `seen` answers as the probe extension's `mcpSeen` does.
 * @param {SimulatedMcp} host
 */
const simulatedMcp = (config, host) => {
  const { reachable = true, githubTools = null, githubStatus = 'connected' } = host
  const servers = [
    ...(githubTools === null ? [] : [{ name: GITHUB_MCP_SERVER, status: 'connected', tools: Array.from({ length: githubTools }, (_, index) => `tool_${index}`) }]),
    ...Object.keys(config.mcpServers ?? {}).map((name) => (name === PROBE_MCP.failing
      ? { name, status: host.failingStatus ?? 'failed', error: 'MCP server process exited before completing the MCP initialize handshake (exit code 3)', tools: [] }
      : { name, status: 'connected', tools: host.withoutFailTool ? ['echo', 'touch'] : ['echo', 'touch', 'fail'] })),
  ]
  const listed = ({ name, status, error }) => {
    if (name === PROBE_MCP.failing) return { name, status, error }
    if (name === GITHUB_MCP_SERVER) return { name, status: githubStatus }
    return { name, status: name === PROBE_MCP.server ? host.listedStatus ?? status : status }
  }
  const listTools = (serverName) => {
    if (!reachable) throw new Error("Cannot read properties of undefined (reading 'listTools')")
    const server = servers.find(({ name, status }) => name === serverName && status === 'connected')
    if (!server) throw new Error(host.absentServerError ?? `Request session.mcp.listTools failed with message: MCP server "${serverName}" is not connected`)
    return serverName === PROBE_MCP.server ? host.listedTools ?? server.tools : server.tools
  }
  let sideEffectCalls = 0
  const asked = async (server, name) => (await config.onPermissionRequest({ kind: 'mcp', serverName: server.name, toolName: name, readOnly: false }))?.kind !== 'reject'
  const touch = async (server, name) => {
    sideEffectCalls += 1
    if (host.firstUnasked && sideEffectCalls === 1) return { type: 'success', text: 'touched' }
    if (host.rejectsUnasked && sideEffectCalls > 1) return { type: 'rejected', text: 'The user rejected this tool call.' }
    const approved = await asked(server, name)
    if (!approved && !host.ignoresReject) return { type: 'rejected', text: 'The user rejected this tool call.' }
    return host.touchFails ? { type: 'failure', text: 'touch failed' } : { type: 'success', text: 'touched' }
  }
  const readOnly = async (server, name, args) => {
    if (host.asksReadOnly) await asked(server, name)
    if (name.endsWith('-fail')) return { type: host.errorAsSuccess ? 'success' : 'failure', text: PROBE_MCP.failure }
    return { type: 'success', text: host.echoText ?? `echo:${args.text}` }
  }
  const execute = async (name, args) => {
    const server = reachable ? servers.find((candidate) => candidate.status === 'connected' && candidate.tools.some((tool) => `${candidate.name}-${tool}` === name)) : undefined
    if (!server && host.absentToolThrows) throw new Error(`unknown tool ${name}`)
    if (!server) return { type: 'failure', text: `Tool '${name}' does not exist.` }
    return name.endsWith('-touch') ? touch(server, name) : readOnly(server, name, args)
  }
  const attempt = async (call) => { try { return { value: await call() } } catch (error) { return { error: error.message } } }
  const result = async (call) => { const { value, error } = await attempt(call); return error !== undefined ? { error } : value }
  const seen = async () => {
    const tools = await attempt(() => listTools(PROBE_MCP.server))
    const github = await attempt(() => listTools(GITHUB_MCP_SERVER))
    const absent = await attempt(() => listTools(PROBE_MCP.absent))
    return {
      servers: reachable ? servers.map(listed) : { error: "Cannot read properties of undefined (reading 'list')" },
      tools: tools.error !== undefined ? { error: tools.error } : tools.value,
      echo: await result(() => execute(`${PROBE_MCP.server}-echo`, { text: PROBE_MCP.sentinel })),
      touch: await result(() => execute(`${PROBE_MCP.server}-touch`, {})),
      fail: await result(() => execute(`${PROBE_MCP.server}-fail`, {})),
      absentServer: absent.error !== undefined ? { error: absent.error } : { listed: true },
      absentTool: await result(() => execute(`${PROBE_MCP.absent}-echo`, {})),
      github: github.error !== undefined ? { error: github.error } : { tools: github.value.length },
    }
  }
  return { seen }
}
