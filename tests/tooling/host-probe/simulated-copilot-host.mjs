// A simulated Copilot SDK for the host probe: sessions, tools, workflows and elicitation behave
// as the issues the probe measures describe. The skraft extension is registered through the
// real register, so the skraft checks measure the driver as it is.
import { readdirSync } from 'node:fs'
import { basename, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { register } from '../../../plugins/skraft-framework/engine/drivers/copilot-workflow/register.mjs'

export const PLUGIN_ROOT = fileURLToPath(new URL('../../../plugins/skraft-framework/', import.meta.url))

/** The `models` of a skraft-config.json the probe checks, and the Copilot catalogue that has them all. */
export const CONFIGURED_MODELS = Object.freeze({ economy: { 'claude-code': { model: 'haiku' }, copilot: { model: 'copilot-small', effort: 'low' } }, standard: { copilot: { model: ['copilot-medium', 'copilot-medium-old'] } } })
const CATALOGUE = ['copilot-small', 'copilot-medium', 'copilot-medium-old']

/** What the simulated host throws for an unknown model and for an effort a model cannot take. */
export const REFUSALS = Object.freeze({ model: 'Model "skraft-probe-no-such-model" is not available. Available models: copilot-small', effort: 'Reasoning effort "max" is not supported for model "copilot-small"' })

/** The host's own tools, offered in every session. */
export const NATIVE_TOOLS = Object.freeze(['bash', 'view', 'edit'])

/**
 * @param {{ skraftLoads?: boolean, models?: string[], agents?: Array<{ id: string, name: string }>, refusals?: { model: string | null, effort: string | null }, staleSnapshot?: boolean, nativeTools?: string[] }} [host]
 *   refusals: what ctx.agent throws, null when it accepts the call; staleSnapshot: metadata.snapshot
 *   keeps the first working directory after a change; nativeTools: the host's own tools
 */
export const simulatedSdk = ({ skraftLoads = true, models = CATALOGUE, agents, refusals = REFUSALS, staleSnapshot = false, home, nativeTools = NATIVE_TOOLS } = {}) => {
  class CopilotClient {
    async start() {}
    async stop() { return [] }
    async listModels() { return models.map((id) => ({ id, name: id, capabilities: {} })) }
    async createSession(config) { return simulatedSession(config, { skraftLoads, agents, refusals, models, staleSnapshot, home, nativeTools }).ready }
  }
  return { CopilotClient, approveAll: () => ({ kind: 'approve-once' }) }
}

const simulatedSession = (config, { skraftLoads, agents, refusals, models, staleSnapshot, home, nativeTools }) => {
  const atLoad = config.workingDirectory
  let mode = 'interactive'
  let tracked = null
  const elicitation = typeof config.onElicitationRequest === 'function'
  const confirm = async (message) => {
    if (!elicitation) throw new Error('Elicitation is not supported by the host')
    const result = await config.onElicitationRequest({ message, requestedSchema: { type: 'object', properties: { confirmed: { type: 'boolean' } } } })
    return result.action === 'accept' && result.content?.confirmed === true
  }
  const tools = new Map(nativeTools.map((name) => [name, async () => name]))
  const workflows = new Map()
  const listeners = []
  const joined = {
    capabilities: { ui: { elicitation } },
    ui: { confirm },
    rpc: { mode: { get: async () => mode }, metadata: { snapshot: async () => ({ workingDirectory: tracked ?? atLoad }) } },
    log: async () => undefined,
  }
  /** The skraft extension, joined through the real register. */
  const joinSkraft = (dir) => register({
    defineWorkflow: (definition) => definition,
    joinSession: async ({ onEvent, workflows: defined, tools: offered }) => {
      listeners.push(onEvent)
      for (const tool of offered) tools.set(tool.name, (args) => tool.handler(args))
      for (const workflow of defined) workflows.set(workflow.meta.name, workflow.run)
      return joined
    },
    pluginRoot: dir, home: home ?? `${atLoad}-home`,
  })
  const joins = []
  for (const dir of config.pluginDirectories) {
    const name = basename(dir)
    if (name === 'probe-agent-plugins' || name === 'probe-claude-plugin') addProbe(name === 'probe-agent-plugins' ? 'a' : 'l')
    if (name === 'skraft-framework' && skraftLoads) joins.push(joinSkraft(dir))
    // probe-broken-workflow: defineWorkflow throws at import, so nothing registers.
    // probe-bad-tool: the host refuses the join, so nothing registers.
  }

  function addProbe(suffix) {
    tools.set(`skraft_probe_state_${suffix}`, async () => JSON.stringify({ atLoad, processCwd: atLoad, tracked, snapshot: staleSnapshot ? atLoad : tracked ?? atLoad, elicitation, mode }))
    tools.set(`skraft_probe_confirm_${suffix}`, async () => {
      try { return JSON.stringify({ value: await confirm('probe') }) } catch (error) { return JSON.stringify({ error: error.message }) }
    })
    workflows.set(`skraft-probe-${suffix}`, async (ctx) => {
      if (ctx.args?.throw === true) throw new Error('skraft-probe-sentinel')
      if (ctx.args?.agentCall) return agentCall(ctx.args.agentCall)
      if (ctx.args?.confirm === true) return { hasSession: true, elicitation, value: await confirm('probe') }
      return { processCwd: atLoad, tracked }
    })
  }

  function agentCall({ model, reasoningEffort }) {
    const refused = !models.includes(model) ? refusals.model : reasoningEffort === 'max' ? refusals.effort : null
    return refused === null ? { threw: false, text: 'ok' } : { threw: true, error: refused }
  }

  let runs = 0
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
        const body = workflows.get(name)
        const runId = `run-${++runs}`
        if (!body) return { runId, status: 'error', error: `unknown workflow ${name}` }
        try {
          return { runId, status: 'completed', result: await body({ args, log: () => undefined, phase: () => undefined, session: { ui: { confirm } }, signal: new AbortController().signal }) }
        } catch (error) {
          return { runId, status: 'error', error: error.message }
        }
      },
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
    agent: { list: async () => ({ agents: agents ?? defaultAgents() }) },
  }
  const session = { rpc, disconnect: async () => undefined }
  return { ready: Promise.all(joins).then(() => session) }
}

const defaultAgents = () => readdirSync(join(PLUGIN_ROOT, 'com.github.copilot', 'agents'))
  .filter((name) => name.endsWith('.agent.md'))
  .map((name) => name.replace(/\.agent\.md$/, ''))
  .map((id) => ({ id: `skraft:${id}`, name: id }))
