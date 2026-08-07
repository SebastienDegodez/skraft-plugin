import { randomUUID as newRandomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'

import { loadAgentDescriptor } from './agent-descriptor.mjs'

const agentTag = (stimulus) => {
  const value = stimulus?.tags?.agent
  if (Array.isArray(value)) {
    if (value.length !== 1) throw new Error('Stimulus must select exactly one agent')
    return value[0]
  }
  if (typeof value !== 'string' || !value) throw new Error('Stimulus must declare tags.agent')
  return value
}

const publicIdentity = (agent) => ({
  id: agent.id,
  name: agent.name,
  path: agent.path,
  sha256: agent.sha256,
  declaredModel: agent.declaredModel,
})

const agentPrompt = (agent) => {
  const instructions = agent.instructions.map(({ path, content }) => `## Companion instruction: ${path}\n\n${content}`)
  const runtimeNotice = [
    '## Evaluation runtime skill loading',
    'Use the runtime skill tool whenever the agent definition requires a skill to be loaded.',
    'Do not read source-relative skill links from the agent definition; Vally stages the selected skills for the runtime.',
  ].join('\n\n')
  return [agent.prompt.trim(), ...instructions, runtimeNotice].join('\n\n')
}

const selectedAgentEvent = (agent) => ({
  type: 'custom',
  data: {
    eventType: 'agent_selected',
    id: agent.id,
    path: agent.path,
    sha256: agent.sha256,
  },
})

const readOnlyTools = ['skill', 'glob', 'grep', 'view']
const workspaceWriteTools = [...readOnlyTools, 'edit', 'bash']
const toolsFor = (stimulus) => stimulus?.tags?.permissions === 'workspace-write' ? workspaceWriteTools : readOnlyTools
const qualifiedTools = (tools) => tools.map((tool) => `builtin:${tool}`)
const promptsFor = (stimulus) => Array.isArray(stimulus.turns) && stimulus.turns.length
  ? stimulus.turns
  : [stimulus.prompt]

export const createAgentExecutor = ({
  repoRoot,
  createClient,
  permissionHandler,
  adapterFactory,
  computeMetrics,
  clock = { now: () => new Date() },
  randomUUID = newRandomUUID,
  loadAgent = loadAgentDescriptor,
} = {}) => {
  if (!repoRoot) throw new Error('repoRoot is required')
  if (!createClient) throw new Error('createClient is required')
  if (!permissionHandler) throw new Error('permissionHandler is required')
  if (!adapterFactory) throw new Error('adapterFactory is required')
  if (!computeMetrics) throw new Error('computeMetrics is required')

  return {
    name: 'skraft-agent-runner',
    supportsPreparedWorkspace: true,
    supportsMultiTurn: true,
    async execute(stimulus, options) {
      const startedAt = clock.now()
      const agent = loadAgent(repoRoot, agentTag(stimulus))
      const stateDir = options.sessionLog?.rootDir ?? join(options.workDir, '.copilot-sdk')
      const client = createClient({ baseDirectory: stateDir })
      const adapter = adapterFactory()
      let session

      try {
        await client.start()
        const tools = toolsFor(stimulus)
        const skillDirectories = [...new Set((options.skills ?? []).flatMap((skill) => skill.path ? [dirname(skill.path)] : []))]
        session = await client.createSession({
          model: options.model,
          workingDirectory: options.workDir,
          customAgents: [{
            name: agent.id,
            displayName: agent.name,
            description: agent.description,
            tools,
            prompt: agentPrompt(agent),
            model: options.model,
            infer: false,
          }],
          agent: agent.id,
          skillDirectories,
          customAgentsLocalOnly: true,
          skipCustomInstructions: true,
          availableTools: qualifiedTools(tools),
          infiniteSessions: { enabled: false },
          enableSessionTelemetry: false,
          onPermissionRequest: (request) => permissionHandler(request, { stimulus, workDir: options.workDir }),
        })
        session.on((event) => {
          adapter.on(event)
          options.onRawEvent?.(event)
        })

        let response
        const turnOutputs = []
        let eventCursor = 0
        for (const [turn, prompt] of promptsFor(stimulus).entries()) {
          response = await session.sendAndWait({ prompt }, options.timeout)
          turnOutputs.push(response?.data?.content ?? '')
          for (let index = eventCursor; index < adapter.events.length; index += 1) {
            adapter.events[index].turn = turn
          }
          eventCursor = adapter.events.length
        }
        const completedAt = clock.now()
        const events = [selectedAgentEvent(agent), ...adapter.events]
        const skillsLoaded = events
          .filter(({ type }) => type === 'skill_activation')
          .map(({ data }) => data.name)
        const metrics = computeMetrics(events)

        return {
          id: randomUUID(),
          stimulus,
          events,
          metrics: { ...metrics, wallTimeMs: completedAt.getTime() - startedAt.getTime() },
          output: turnOutputs.map((output, index) => `## Turn ${index + 1}\n${output}`).join('\n\n'),
          workDir: options.workDir,
          endReason: 'completed',
          metadata: {
            model: adapter.model ?? options.model ?? agent.declaredModel,
            skillsLoaded,
            startedAt,
            completedAt,
            executor: 'skraft-agent-runner',
            sessionID: session.sessionId,
            agent: publicIdentity(agent),
            skillsConfigured: agent.skills,
            instructionsConfigured: agent.instructions.map(({ path }) => path),
          },
        }
      } finally {
        await session?.disconnect()
        await client.stop()
      }
    },
    async shutdown() {},
  }
}
