import { randomUUID as newRandomUUID } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
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

// A SKRAFT descriptor spawns its chain through markdown links to sibling
// `.agent.md` files. Those links resolve in the plugin tree and nowhere else: in
// a prepared evaluation workspace the chain exists only as registered custom
// agents reached through the runtime dispatch tool. An agent that cannot open
// the link it was told to follow does the next best thing and narrates the
// review it was supposed to delegate — which is precisely the failure the
// dispatch metrics exist to catch, arriving as a harness artefact rather than a
// finding. Naming the registered ids removes that excuse.
const dispatchNotice = (dispatchable) => [
  '## Evaluation runtime sub-agent dispatch',
  'The agent definition links its sub-agents as source files. Those links do not resolve here.',
  `Dispatch with the runtime ${DISPATCH_TOOL} tool, naming exactly one registered id per dispatch: ${dispatchable.join(', ')}.`,
  'Narrating a sub-agent\'s analysis in your own context is not a dispatch.',
].join('\n\n')

// Every SKRAFT descriptor reaches its own tooling through `$CLAUDE_PLUGIN_ROOT`:
// the orchestrator rehydrates state with `src/cli/state.mjs`, a reviewer renders
// its verdict with `src/cli/artifact.mjs`. Nothing exports that variable here, so
// the mandated command expands to `node "/src/cli/state.mjs"` and the agent
// spends its turn hunting for the CLI instead of doing the phase — one trial
// burned ten dispatches looking for it and never reached a phase specialist.
//
// A stimulus that needs the CLI stages it into the workspace under
// `.skraft-plugin/` (the source is dependency-free, so the layer directories
// copy as-is). Staging it INSIDE the workspace is the point: no permission is
// widened and no environment is replaced. Only `src/` is staged, never `agents/`
// or `skills/` — an agent given its own descriptors reads them instead of
// working.
const STAGED_PLUGIN_DIR = '.skraft-plugin'
const stagedPluginRoot = (workDir) => {
  const candidate = join(workDir, STAGED_PLUGIN_DIR)
  return existsSync(candidate) ? candidate : undefined
}

const pluginRootNotice = (pluginRoot) => [
  '## Evaluation runtime plugin root',
  `$CLAUDE_PLUGIN_ROOT is not exported here. Wherever the agent definition writes it, use ${pluginRoot} instead.`,
  `A mandated command such as \`node "$CLAUDE_PLUGIN_ROOT/src/cli/state.mjs"\` is run as \`node "${pluginRoot}/src/cli/state.mjs"\`.`,
].join('\n\n')

const agentPrompt = (agent, { dispatchable = [], pluginRoot } = {}) => {
  const instructions = agent.instructions.map(({ path, content }) => `## Companion instruction: ${path}\n\n${content}`)
  const runtimeNotice = [
    '## Evaluation runtime skill loading',
    'Use the runtime skill tool whenever the agent definition requires a skill to be loaded.',
    'Do not read source-relative skill links from the agent definition; Vally stages the selected skills for the runtime.',
  ].join('\n\n')
  const notices = [runtimeNotice]
  if (pluginRoot) notices.push(pluginRootNotice(pluginRoot))
  if (dispatchable.length) notices.push(dispatchNotice(dispatchable))
  return [agent.prompt.trim(), ...instructions, ...notices].join('\n\n')
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
// The runtime spells its sub-agent dispatch built-in `task` (see BuiltInTools.
// Isolated in @github/copilot-sdk). Enabling a name it does not know is silent:
// the session starts, the agent is told to delegate, no dispatch tool exists, so
// it narrates the fan-out instead — and every dispatch grader reads that as the
// agent refusing to delegate rather than as a harness that never offered it.
const DISPATCH_TOOL = 'task'
const toolsFor = (stimulus, dispatches) => {
  const base = stimulus?.tags?.permissions === 'workspace-write' ? workspaceWriteTools : readOnlyTools
  return dispatches ? [...base, DISPATCH_TOOL] : base
}
const qualifiedTools = (tools) => tools.map((tool) => `builtin:${tool}`)
// The primary agent is selected explicitly, so it stays out of model inference.
// A declared sub-agent is the opposite: the dispatch tool can only offer an agent
// the runtime is allowed to infer, so `infer: false` would silently make the
// chain undispatchable.
const customAgent = (agent, { tools, model, infer, dispatchable = [], pluginRoot }) => ({
  name: agent.id,
  displayName: agent.name,
  description: agent.description,
  tools,
  prompt: agentPrompt(agent, { dispatchable: dispatchable.filter((id) => id !== agent.id), pluginRoot }),
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

// A skill the ORCHESTRATOR loads and a skill its SPECIALIST loads are different
// claims, and `skill-invocation` cannot tell them apart: it scans the whole
// trajectory, so a chain passes "the designer loaded bdd-methodology" whenever
// anyone did. The Copilot adapter stamps `agentId` on every event a sub-agent
// produced (absent for the root agent), so the two buckets are published
// separately and a spec can assert the one it means. Sub-agent entries are
// qualified `<agentId>/<skill>`, which a `contains:` assertion can read either
// precisely (`acceptance-designer/bdd-methodology`) or loosely (`bdd-methodology`).
const skillMetrics = (events) => {
  const activations = events.filter(({ type }) => type === 'skill_activation')
  const named = (entries) => [...new Set(entries)].join(' ')
  return {
    rootSkillsLoaded: named(activations.filter(({ agentId }) => !agentId).map(({ data }) => data.name)),
    subagentSkillsLoaded: named(activations.filter(({ agentId }) => agentId).map(({ agentId, data }) => `${agentId}/${data.name}`)),
  }
}

const delegationMetrics = (events) => {
  const dispatches = events.filter(({ type, data }) => type === 'tool_call' && data?.toolName === DISPATCH_TOOL)
  return {
    subagentDispatchCount: dispatches.length,
    dispatchedSubagents: dispatches.map(({ data }) => JSON.stringify(data?.arguments ?? {})).join(' '),
    ...skillMetrics(events),
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
        const dispatchable = subagents.map(({ id }) => id)
        const pluginRoot = stagedPluginRoot(options.workDir)
        const skillDirectories = [...new Set((options.skills ?? []).flatMap((skill) => skill.path ? [dirname(skill.path)] : []))]
        session = await client.createSession({
          model: options.model,
          workingDirectory: options.workDir,
          customAgents: [
            customAgent(agent, { tools, model: options.model, infer: false, dispatchable, pluginRoot }),
            ...subagents.map((entry) => customAgent(entry, { tools, model: options.model, infer: true, dispatchable, pluginRoot })),
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
