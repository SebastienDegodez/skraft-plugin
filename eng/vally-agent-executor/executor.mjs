import { randomUUID as newRandomUUID } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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
// The dispatch tool also lets the caller pick the model and the reasoning effort
// its sub-agent runs on. Left open, that hands the choice to whichever model
// happens to be answering: one trial sent the review lenses to a small model at
// `reasoning_effort: high`, the runtime refused a combination that model does not
// support, all three lenses failed, and the lead spent the rest of its budget
// re-dispatching them until the trial timed out. Even when the switch succeeds
// the run is worthless — a suite that pins a model measures a different one. The
// harness already gives every registered agent the pinned model, so the dispatch
// only has to leave it alone.
const dispatchNotice = (dispatchable) => [
  '## Evaluation runtime sub-agent dispatch',
  'The agent definition links its sub-agents as source files. Those links do not resolve here.',
  `Dispatch with the runtime ${DISPATCH_TOOL} tool, naming exactly one registered id per dispatch: ${dispatchable.join(', ')}.`,
  'Narrating a sub-agent\'s analysis in your own context is not a dispatch.',
  `Pass only \`agent_type\`, \`name\`, \`description\` and \`prompt\`. Never pass \`model\`, \`reasoning_effort\` or \`context_tier\`: every registered agent is already on the model this run pins, and a dispatch that names its own risks a pairing the runtime rejects — the sub-agent fails to start and the work you delegated never happens.`,
].join('\n\n')

// Every SKRAFT descriptor reaches its own tooling through `$CLAUDE_PLUGIN_ROOT`:
// the orchestrator rehydrates state with `src/cli/state.mjs`, a reviewer renders
// its verdict with `src/cli/artifact.mjs`. Nothing exports that variable here, so
// the mandated command expanded to `node "/src/cli/state.mjs"` and the agent
// spent its turn hunting for the CLI instead of doing the phase — one trial
// burned ten dispatches looking for it and never reached a phase specialist.
//
// The tree is assembled once per executor, outside the workspace: Vally captures
// the diff baseline before `execute()` runs, so anything staged into the
// workspace here would show up as work the agent did and break every
// `diff-empty`.
//
// What is copied is what the CLI needs to run and nothing that is itself under
// test. Never `skills/` — a skill is loaded through the runtime skill tool, not
// read off disk, and a copy here would only invite an agent to open the file
// instead. Never `agents/` — the descriptors are already injected as prompts, and
// an agent that can open a sibling's descriptor reads it instead of dispatching,
// which is the exact behaviour the dispatch metrics exist to catch. Never
// `src/node_modules` — 67 MB the dependency-free source never loads.
const PLUGIN_SUBTREES = ['src/cli', 'src/domain', 'src/application', 'src/adapters', 'src/ports', 'assets']

// Where `skill <name>` resolves from. Agent suites stage nothing of their own —
// `options.skills` is empty for every stimulus under tests/agents — and left at
// that the runtime falls back to ambient discovery: the same mandatory skill
// loads in one trial and comes back `Skill not found` in the next, so a grader on
// a skill the descriptor requires measures the weather. Naming the directory
// makes the lookup deterministic. It withholds nothing that is under test: an
// agent suite is scored on whether its graders hold, with no baseline arm to
// compare against (see eng/lib/agent-verdict.mjs).
const pluginSkillsDirectory = (repoRoot) => join(repoRoot, 'plugins', 'skraft-framework', 'skills')

const copyPluginRoot = (repoRoot) => {
  const root = mkdtempSync(join(tmpdir(), 'skraft-plugin-root-'))
  for (const subtree of PLUGIN_SUBTREES) {
    cpSync(join(repoRoot, 'plugins', 'skraft-framework', subtree), join(root, subtree), { recursive: true })
  }
  return root
}

const pluginRootNotice = (pluginRoot) => [
  '## Evaluation runtime plugin root',
  `$CLAUDE_PLUGIN_ROOT is not exported here. Wherever the agent definition writes it, use ${pluginRoot} instead.`,
  `A mandated command such as \`node "$CLAUDE_PLUGIN_ROOT/src/cli/state.mjs"\` is run as \`node "${pluginRoot}/src/cli/state.mjs"\`.`,
  'It holds the CLI and its templates only. Read nothing else from it, and write nothing into it.',
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

  let pluginRoot

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
        pluginRoot ??= copyPluginRoot(repoRoot)
        const skillDirectories = [...new Set([
          ...(options.skills ?? []).flatMap((skill) => (skill.path ? [dirname(skill.path)] : [])),
          pluginSkillsDirectory(repoRoot),
        ])]
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
            // The root the prompt names has to be the root the handler admits.
            // Telling an agent to run `node <pluginRoot>/src/cli/artifact.mjs`
            // while the handler treats that absolute path as an escape denies
            // the command it was just ordered to run, and the refusal reads as
            // the agent declining to write its artefact.
            readableRoots: [options.workDir, pluginRoot, ...skillDirectories],
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
    async shutdown() {
      if (!pluginRoot) return
      rmSync(pluginRoot, { recursive: true, force: true })
      pluginRoot = undefined
    },
  }
}
