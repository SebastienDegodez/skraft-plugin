// A simulated Copilot SDK for the host probe: sessions, tools, workflows and elicitation behave
// as the issues the probe measures describe. The skraft-pipeline workflow and skraft_decide run
// the real engine, with the directory fixed at load like the extension does today.
import { readdirSync } from 'node:fs'
import { basename, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runSkraftPipelineWorkflow } from '../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { createSkraftDecideTool } from '../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-decide-tool.mjs'
import { COPILOT_MODELS } from '../../../plugins/skraft-framework/engine/drivers/copilot-workflow/copilot-models.mjs'

export const PLUGIN_ROOT = fileURLToPath(new URL('../../../plugins/skraft-framework/', import.meta.url))

/**
 * @param {{ skraftLoads?: boolean, models?: string[], agents?: Array<{ id: string, name: string }> }} [host]
 */
export const simulatedSdk = ({ skraftLoads = true, models = Object.values(COPILOT_MODELS).flat(), agents } = {}) => {
  class CopilotClient {
    async start() {}
    async stop() { return [] }
    async listModels() { return models.map((id) => ({ id, name: id, capabilities: {} })) }
    async createSession(config) { return simulatedSession(config, { skraftLoads, agents }) }
  }
  return { CopilotClient, approveAll: () => ({ kind: 'approve-once' }) }
}

const simulatedSession = (config, { skraftLoads, agents }) => {
  const atLoad = config.workingDirectory
  let mode = 'interactive'
  let tracked = null
  const elicitation = typeof config.onElicitationRequest === 'function'
  const confirm = async (message) => {
    if (!elicitation) throw new Error('Elicitation is not supported by the host')
    const result = await config.onElicitationRequest({ message, requestedSchema: { type: 'object', properties: { confirmed: { type: 'boolean' } } } })
    return result.action === 'accept' && result.content?.confirmed === true
  }
  const tools = new Map()
  const workflows = new Map()
  for (const dir of config.pluginDirectories) {
    const name = basename(dir)
    if (name === 'probe-agent-plugins' || name === 'probe-claude-plugin') addProbe(name === 'probe-agent-plugins' ? 'a' : 'l')
    if (name === 'skraft-framework' && skraftLoads) {
      const decide = createSkraftDecideTool({ cwd: atLoad, pluginRoot: dir })
      tools.set('skraft_decide', (args) => decide.handler(args))
      workflows.set('skraft-pipeline', (ctx) => runSkraftPipelineWorkflow(ctx, { cwd: atLoad, pluginRoot: dir }))
    }
    // probe-broken-workflow: defineWorkflow throws at import, so nothing registers.
    // probe-bad-tool: the host refuses the join, so nothing registers.
  }

  function addProbe(suffix) {
    tools.set(`skraft_probe_state_${suffix}`, async () => JSON.stringify({ atLoad, processCwd: atLoad, tracked, elicitation, mode }))
    tools.set(`skraft_probe_confirm_${suffix}`, async () => {
      try { return JSON.stringify({ value: await confirm('probe') }) } catch (error) { return JSON.stringify({ error: error.message }) }
    })
    workflows.set(`skraft-probe-${suffix}`, async (ctx) => {
      if (ctx.args?.throw === true) throw new Error('skraft-probe-sentinel')
      if (ctx.args?.confirm === true) return { hasSession: true, elicitation, value: await confirm('probe') }
      return { processCwd: atLoad, tracked }
    })
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
          return { runId, status: 'completed', result: await body({ args, log: () => undefined, phase: () => undefined, session: { ui: { confirm } } }) }
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
        return { workingDirectory }
      },
    },
    mode: { get: async () => mode, set: async ({ mode: next }) => { mode = next; return mode } },
    extensions: { list: async () => ({ extensions: [] }) },
    agent: { list: async () => ({ agents: agents ?? defaultAgents() }) },
  }
  return { rpc, disconnect: async () => undefined }
}

const defaultAgents = () => readdirSync(join(PLUGIN_ROOT, 'com.github.copilot', 'agents'))
  .filter((name) => name.endsWith('.agent.md'))
  .map((name) => name.replace(/\.agent\.md$/, ''))
  .map((id) => ({ id: `skraft:${id}`, name: id }))
