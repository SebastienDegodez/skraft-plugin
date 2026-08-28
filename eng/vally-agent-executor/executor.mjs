import { randomUUID as newRandomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { mergeEnv } from '@microsoft/vally'

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

// A SKRAFT phase agent delegates: the orchestrator dispatches specialists and
// reviewers, a reviewer fans out to its lenses. The chain a stimulus exercises
// is declared explicitly so the harness registers exactly those agents and
// nothing else.
const subagentTags = (stimulus) => {
  const value = stimulus?.tags?.subagents
  if (value === undefined) return []
  const ids = Array.isArray(value) ? value : [value]
  if (ids.some((id) => typeof id !== 'string' || !id)) throw new Error('Stimulus tags.subagents must list agent ids')
  return [...new Set(ids)]
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
const toolsFor = (stimulus, dispatches) => {
  const base = stimulus?.tags?.permissions === 'workspace-write' ? workspaceWriteTools : readOnlyTools
  return dispatches ? [...base, 'agent'] : base
}
const qualifiedTools = (tools) => tools.map((tool) => `builtin:${tool}`)
// The primary agent is selected explicitly, so it stays out of model inference.
// A declared sub-agent is the opposite: the dispatch tool can only offer an agent
// the runtime is allowed to infer, so `infer: false` would silently make the
// chain undispatchable.
const customAgent = (agent, tools, model, infer) => ({
  name: agent.id,
  displayName: agent.name,
  description: agent.description,
  tools,
  prompt: agentPrompt(agent),
  model,
  infer,
})
const promptsFor = (stimulus) => Array.isArray(stimulus.turns) && stimulus.turns.length
  ? stimulus.turns
  : [stimulus.prompt]

// An agent can narrate a fan-out it never performed. Only a dispatch tool call
// distinguishes four independent reviews from one agent role-playing four
// headings, so the count and the requested agents are published as run metrics a
// built-in grader can assert on.
const DELEGATION_METRICS_FILE = 'custom_metrics.json'

const agentEnvironment = (env, workDir) => {
  if (!env || Object.keys(env).length === 0) return undefined
  const resolved = { ...env }
  if (resolved.PATH) {
    resolved.PATH = resolved.PATH
      .replaceAll('${PATH}', process.env.PATH ?? '')
      .replaceAll('$PATH', process.env.PATH ?? '')
      .replace(/(^|:)\.eval-bin(?=:|$)/g, `$1${join(workDir, '.eval-bin')}`)
  }
  return mergeEnv(process.env, resolved)
}

const delegationMetrics = (events) => {
  const dispatches = events.filter(({ type, data }) => type === 'tool_call' && data?.toolName === 'agent')
  return {
    subagentDispatchCount: dispatches.length,
    dispatchedSubagents: dispatches.map(({ data }) => JSON.stringify(data?.arguments ?? {})).join(' '),
  }
}

const publishMetrics = (artifactDir, metrics) => {
  mkdirSync(artifactDir, { recursive: true })
  writeFileSync(join(artifactDir, DELEGATION_METRICS_FILE), `${JSON.stringify(metrics, null, 2)}\n`)
}

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
    supportsEnvVars: true,
    async execute(stimulus, options) {
      const startedAt = clock.now()
      const agent = loadAgent(repoRoot, agentTag(stimulus))
      const subagents = subagentTags(stimulus).map((id) => loadAgent(repoRoot, id))
      const stateDir = options.sessionLog?.rootDir ?? join(options.workDir, '.copilot-sdk')
      const clientOptions = { baseDirectory: stateDir }
      const env = agentEnvironment(options.env, options.workDir)
      if (env) clientOptions.env = env
      const client = createClient(clientOptions)
      const adapter = adapterFactory()
      let session

      try {
        await client.start()
        const tools = toolsFor(stimulus, subagents.length > 0)
        const skillDirectories = [...new Set((options.skills ?? []).flatMap((skill) => skill.path ? [dirname(skill.path)] : []))]
        session = await client.createSession({
          model: options.model,
          workingDirectory: options.workDir,
          customAgents: [
            customAgent(agent, tools, options.model, false),
            ...subagents.map((entry) => customAgent(entry, tools, options.model, true)),
          ],
          agent: agent.id,
          skillDirectories,
          customAgentsLocalOnly: true,
          skipCustomInstructions: true,
          availableTools: qualifiedTools(tools),
          infiniteSessions: { enabled: false },
          enableSessionTelemetry: false,
          onPermissionRequest: (request) => permissionHandler(request, {
            stimulus,
            workDir: options.workDir,
            readableRoots: [options.workDir, ...skillDirectories],
          }),
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
        publishMetrics(stateDir, delegationMetrics(events))

        return {
          id: randomUUID(),
          stimulus,
          events,
          metrics: { ...metrics, wallTimeMs: completedAt.getTime() - startedAt.getTime() },
          output: turnOutputs.map((output, index) => `## Turn ${index + 1}\n${output}`).join('\n\n'),
          workDir: options.workDir,
          artifactDir: stateDir,
          endReason: 'completed',
          metadata: {
            model: adapter.model ?? options.model ?? agent.declaredModel,
            skillsLoaded,
            startedAt,
            completedAt,
            executor: 'skraft-agent-runner',
            sessionID: session.sessionId,
            agent: publicIdentity(agent),
            subagents: subagents.map(publicIdentity),
            skillsConfigured: agent.skills,
            subagentSkillsConfigured: Object.fromEntries(subagents.map(({ id, skills }) => [id, skills])),
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
