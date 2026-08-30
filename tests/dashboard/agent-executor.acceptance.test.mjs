import { createHash } from 'node:crypto'
import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import { computeMetrics } from '@microsoft/vally'
import { CopilotAdapter } from '@microsoft/vally/trajectory'

import { createAgentExecutor } from '../../eng/vally-agent-executor/executor.mjs'

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'))
const agentPath = join(repoRoot, 'plugins/skraft-framework/com.anthropic.claude-code/agents/software-engineer.md')
const relativeAgentPath = relative(repoRoot, agentPath).split('\\').join('/')
const expectedHash = createHash('sha256').update(readFileSync(agentPath)).digest('hex')
const activatedSkills = ['outside-in-tdd', 'test-design-mandates', 'craft-discipline']
const blockedOutput = '{"status":"blocked","type":"clarification_needed"}'

const rawEvents = [
  { type: 'session.start', timestamp: '2026-08-06T10:00:00.000Z', data: { selectedModel: 'claude-sonnet-4.6', sessionId: 'session-1', context: { cwd: '/tmp/work' } } },
  { type: 'assistant.turn_start', timestamp: '2026-08-06T10:00:01.000Z', data: { turnId: 'turn-1' } },
  ...activatedSkills.map((name, index) => ({
    type: 'skill.invoked',
    timestamp: `2026-08-06T10:00:0${index + 2}.000Z`,
    data: { name, path: `/tmp/work/.skills/${name}/SKILL.md`, content: `# ${name}` },
  })),
  { type: 'assistant.message', timestamp: '2026-08-06T10:00:06.000Z', data: { content: blockedOutput } },
  { type: 'assistant.usage', timestamp: '2026-08-06T10:00:07.000Z', data: { model: 'claude-sonnet-4.6', inputTokens: 100, outputTokens: 20 } },
  { type: 'assistant.turn_end', timestamp: '2026-08-06T10:00:08.000Z', data: { turnId: 'turn-1' } },
]

describe('Vally real-agent executor', () => {
  it('selects the exact agent and delegates event semantics to Vally CopilotAdapter', async () => {
    const calls = { clientOptions: [], sessions: [], prompts: [], disconnected: 0, stopped: 0 }
    let eventHandler
    const session = {
      sessionId: 'session-1',
      on(handler) { eventHandler = handler },
      async sendAndWait(message) {
        calls.prompts.push(message)
        for (const event of rawEvents) eventHandler(event)
        return { data: { content: blockedOutput } }
      },
      async disconnect() { calls.disconnected += 1 },
    }
    const client = {
      async start() {},
      async createSession(config) { calls.sessions.push(config); return session },
      async stop() { calls.stopped += 1 },
    }
    const executor = createAgentExecutor({
      repoRoot,
      createClient(options) { calls.clientOptions.push(options); return client },
      permissionHandler: () => ({ kind: 'reject' }),
      adapterFactory: () => new CopilotAdapter(),
      computeMetrics,
      clock: { now: () => new Date('2026-08-06T10:00:10.000Z') },
      randomUUID: () => 'trajectory-1',
    })
    const prompt = 'Implement the requested behavior. If required inputs are absent, report the blocker.'
    const stimulus = { name: 'missing-distill-artifacts', prompt, tags: { agent: 'software-engineer' } }
    const skillPaths = activatedSkills.map((name) => ({ name, path: `/tmp/work/.skills/${name}/SKILL.md` }))

    const trajectory = await executor.execute(stimulus, {
      workDir: '/tmp/work',
      model: 'claude-sonnet-4.6',
      timeout: 30_000,
      sessionLog: { rootDir: '/tmp/session-log' },
      skills: skillPaths,
    })

    deepStrictEqual(calls.clientOptions, [{ baseDirectory: '/tmp/session-log' }])
    strictEqual(calls.sessions.length, 1)
    const config = calls.sessions[0]
    strictEqual(config.agent, 'software-engineer')
    strictEqual(config.model, 'claude-sonnet-4.6')
    strictEqual(config.workingDirectory, '/tmp/work')
    deepStrictEqual(config.availableTools, ['builtin:skill', 'builtin:glob', 'builtin:grep', 'builtin:view'])
    deepStrictEqual(config.skillDirectories, skillPaths.map(({ path }) => dirname(path)))
    strictEqual(config.customAgents.length, 1)
    strictEqual(config.customAgents[0].name, 'software-engineer')
    strictEqual(config.customAgents[0].skills, undefined)
    deepStrictEqual(config.customAgents[0].tools, ['skill', 'glob', 'grep', 'view'])
    strictEqual(config.customAgents[0].prompt.includes('Use the runtime skill tool'), true)
    strictEqual(config.customAgents[0].prompt.includes('already eagerly loaded'), false)
    deepStrictEqual(calls.prompts, [{ prompt }])

    strictEqual(trajectory.id, 'trajectory-1')
    strictEqual(trajectory.output, `## Turn 1\n${blockedOutput}`)
    deepStrictEqual(
      trajectory.events.filter(({ type }) => type === 'skill_activation').map(({ data }) => data.name),
      activatedSkills,
    )
    strictEqual(trajectory.metrics.skillActivationCount, 3)
    deepStrictEqual(trajectory.metadata.skillsLoaded, activatedSkills)
    deepStrictEqual(trajectory.metadata.agent, {
      id: 'software-engineer',
      name: 'Skraft - Software Engineer',
      path: relativeAgentPath,
      sha256: expectedHash,
      declaredModel: 'Claude Sonnet 5,Claude Sonnet 5 (copilot),claude-sonnet-5',
    })
    deepStrictEqual(trajectory.events[0], {
      type: 'custom',
      data: {
        eventType: 'agent_selected',
        id: 'software-engineer',
        path: relativeAgentPath,
        sha256: expectedHash,
      },
    })
    strictEqual(calls.disconnected, 1)
    strictEqual(calls.stopped, 1)
  })
  it('runs an approved delivery stimulus across the RED checkpoint with bounded write tools', async () => {
    const calls = { clientOptions: [], sessions: [], prompts: [] }
    const responses = ['{"status":"blocked","type":"clarification_needed","message":"RED ready for validation"}', 'GREEN']
    let eventHandler
    const session = {
      sessionId: 'session-2',
      on(handler) { eventHandler = handler },
      async sendAndWait(message) {
        calls.prompts.push(message)
        const content = responses[calls.prompts.length - 1]
        eventHandler({ type: 'assistant.message', data: { content } })
        return { data: { content } }
      },
      async disconnect() {},
    }
    const client = {
      async start() {},
      async createSession(config) { calls.sessions.push(config); return session },
      async stop() {},
    }
    const permissionCalls = []
    const executor = createAgentExecutor({
      repoRoot,
      createClient(options) { calls.clientOptions.push(options); return client },
      permissionHandler(request, context) { permissionCalls.push({ request, context }); return { kind: 'approve-once' } },
      adapterFactory: () => new CopilotAdapter(),
      computeMetrics,
      clock: { now: () => new Date('2026-08-06T10:00:10.000Z') },
      randomUUID: () => 'trajectory-2',
    })
    const turns = [
      'Implement the approved behavior and stop after a clean inner RED for validation.',
      'I validate the failing inner test. Continue through GREEN and available verification.',
    ]
    const stimulus = {
      name: 'approved-node-delivery',
      prompt: turns.join('\n\n'),
      turns,
      tags: { agent: 'software-engineer', permissions: 'workspace-write' },
    }

    const trajectory = await executor.execute(stimulus, {
      workDir: '/tmp/work',
      model: 'claude-sonnet-4.6',
      timeout: 30_000,
      sessionLog: { rootDir: '/tmp/session-log' },
      skills: [],
      env: { PATH: '.eval-bin:${PATH}', SKRAFT_GATE_FIXTURE: 'canonical' },
    })

    strictEqual(executor.supportsMultiTurn, true)
    strictEqual(executor.supportsEnvVars, true)
    strictEqual(calls.clientOptions[0].env.PATH.startsWith('/tmp/work/.eval-bin:'), true)
    strictEqual(calls.clientOptions[0].env.PATH.endsWith(process.env.PATH), true)
    strictEqual(calls.clientOptions[0].env.SKRAFT_GATE_FIXTURE, 'canonical')
    deepStrictEqual(calls.prompts, turns.map((prompt) => ({ prompt })))
    deepStrictEqual(calls.sessions[0].availableTools, [
      'builtin:skill', 'builtin:glob', 'builtin:grep', 'builtin:view', 'builtin:edit', 'builtin:bash',
    ])
    deepStrictEqual(calls.sessions[0].customAgents[0].tools, ['skill', 'glob', 'grep', 'view', 'edit', 'bash'])
    strictEqual(trajectory.output, [
      '## Turn 1',
      responses[0],
      '',
      '## Turn 2',
      responses[1],
    ].join('\n'))
    deepStrictEqual(
      trajectory.events.filter(({ type }) => type === 'assistant_message').map(({ turn, data }) => ({ turn, content: data.content })),
      responses.map((content, turn) => ({ turn, content })),
    )

    calls.sessions[0].onPermissionRequest({ kind: 'write', fileName: '/tmp/work/src/domain.mjs' })
    deepStrictEqual(permissionCalls[0].context, { stimulus, workDir: '/tmp/work', readableRoots: ['/tmp/work'] })
  })

  it('registers the declared review chain and grants dispatch only to a delegating stimulus', async () => {
    const calls = { sessions: [] }
    const session = {
      sessionId: 'session-3',
      on() {},
      async sendAndWait() { return { data: { content: 'APPROVED' } } },
      async disconnect() {},
    }
    const executor = createAgentExecutor({
      repoRoot,
      createClient: () => ({
        async start() {},
        async createSession(config) { calls.sessions.push(config); return session },
        async stop() {},
      }),
      permissionHandler: () => ({ kind: 'approve-once' }),
      adapterFactory: () => new CopilotAdapter(),
      computeMetrics,
      clock: { now: () => new Date('2026-08-12T10:00:00.000Z') },
      randomUUID: () => 'trajectory-3',
    })
    const lenses = ['quality-gates-lens', 'architecture-boundaries-lens', 'test-integrity-lens', 'cold-reader-lens']
    const stimulus = {
      name: 'delivery-review-fans-out',
      prompt: 'Review the delivered change and report a verdict.',
      tags: { agent: 'software-engineer-reviewer', subagents: lenses, permissions: 'workspace-write' },
    }

    const trajectory = await executor.execute(stimulus, {
      workDir: '/tmp/work',
      model: 'claude-sonnet-4.6',
      timeout: 30_000,
      sessionLog: { rootDir: '/tmp/session-log' },
      skills: [],
    })

    const config = calls.sessions[0]
    strictEqual(config.agent, 'software-engineer-reviewer')
    deepStrictEqual(config.customAgents.map(({ name }) => name), ['software-engineer-reviewer', ...lenses])
    deepStrictEqual(config.customAgents.map(({ infer }) => infer), [false, true, true, true, true])
    deepStrictEqual(config.customAgents[0].tools, ['skill', 'glob', 'grep', 'view', 'edit', 'bash', 'task'])
    deepStrictEqual(config.availableTools, [
      'builtin:skill', 'builtin:glob', 'builtin:grep', 'builtin:view', 'builtin:edit', 'builtin:bash', 'builtin:task',
    ])
    deepStrictEqual(trajectory.metadata.subagents.map(({ id }) => id), lenses)
    deepStrictEqual(trajectory.metadata.skillsConfigured, ['adversarial-review-lenses'])
    deepStrictEqual(trajectory.metadata.subagentSkillsConfigured, Object.fromEntries(lenses.map((id) => [id, []])))
  })

  it('names the registered chain in the prompt so a descriptor link is not the only route to a dispatch', async () => {
    const calls = { sessions: [] }
    const session = {
      sessionId: 'session-4',
      on() {},
      async sendAndWait() { return { data: { content: 'NEEDS_REWORK' } } },
      async disconnect() {},
    }
    const executor = createAgentExecutor({
      repoRoot,
      createClient: () => ({
        async start() {},
        async createSession(config) { calls.sessions.push(config); return session },
        async stop() {},
      }),
      permissionHandler: () => ({ kind: 'approve-once' }),
      adapterFactory: () => new CopilotAdapter(),
      computeMetrics,
      clock: { now: () => new Date('2026-08-12T10:00:00.000Z') },
      randomUUID: () => 'trajectory-4',
    })
    const lenses = ['quality-gates-lens', 'test-integrity-lens']
    const stimulus = {
      name: 'delivery-review-fans-out',
      prompt: 'Review the delivered change and report a verdict.',
      tags: { agent: 'software-engineer-reviewer', subagents: lenses },
    }

    await executor.execute(stimulus, {
      workDir: '/tmp/work',
      model: 'claude-sonnet-4.6',
      timeout: 30_000,
      sessionLog: { rootDir: '/tmp/session-log' },
      skills: [],
    })

    const [reviewer, firstLens] = calls.sessions[0].customAgents
    strictEqual(reviewer.prompt.includes('quality-gates-lens, test-integrity-lens'), true)
    strictEqual(reviewer.prompt.includes('Evaluation runtime sub-agent dispatch'), true)
    // A lens is a leaf of the chain: it must not be told it can dispatch itself.
    strictEqual(firstLens.prompt.includes('quality-gates-lens'), false)
    strictEqual(firstLens.prompt.includes('test-integrity-lens'), true)
  })

  it('leaves a stimulus that delegates to nobody without a dispatch notice', async () => {
    const calls = { sessions: [] }
    const executor = createAgentExecutor({
      repoRoot,
      createClient: () => ({
        async start() {},
        async createSession(config) {
          calls.sessions.push(config)
          return { sessionId: 'session-5', on() {}, async sendAndWait() { return { data: { content: '' } } }, async disconnect() {} }
        },
        async stop() {},
      }),
      permissionHandler: () => ({ kind: 'approve-once' }),
      adapterFactory: () => new CopilotAdapter(),
      computeMetrics,
      clock: { now: () => new Date('2026-08-12T10:00:00.000Z') },
      randomUUID: () => 'trajectory-5',
    })

    await executor.execute(
      { name: 'solo', prompt: 'Report the blocker.', tags: { agent: 'software-engineer' } },
      { workDir: '/tmp/work', model: 'claude-sonnet-4.6', timeout: 30_000, sessionLog: { rootDir: '/tmp/session-log' }, skills: [] },
    )

    strictEqual(calls.sessions[0].customAgents[0].prompt.includes('Evaluation runtime sub-agent dispatch'), false)
  })

  // `$CLAUDE_PLUGIN_ROOT` is exported by nobody here, so a descriptor's mandated
  // `node "$CLAUDE_PLUGIN_ROOT/src/cli/state.mjs"` resolves to `/src/...` and the
  // agent hunts for a CLI instead of running the phase. A stimulus that needs it
  // stages the tree into the workspace; the notice appears only when it did, so a
  // stimulus without it is never pointed at a path that does not exist.
  it('names a staged plugin CLI as the plugin root, and stays silent when none was staged', async () => {
    const calls = { sessions: [] }
    const executor = createAgentExecutor({
      repoRoot,
      createClient: () => ({
        async start() {},
        async createSession(config) {
          calls.sessions.push(config)
          return { sessionId: 'session-6', on() {}, async sendAndWait() { return { data: { content: '' } } }, async disconnect() {} }
        },
        async stop() {},
      }),
      permissionHandler: () => ({ kind: 'approve-once' }),
      adapterFactory: () => new CopilotAdapter(),
      computeMetrics,
      clock: { now: () => new Date('2026-08-12T10:00:00.000Z') },
      randomUUID: () => 'trajectory-6',
    })
    const stimulus = { name: 'solo', prompt: 'Report the blocker.', tags: { agent: 'software-engineer' } }
    const staged = mkdtempSync(join(tmpdir(), 'skraft-staged-workspace-'))
    mkdirSync(join(staged, '.skraft-plugin', 'src', 'cli'), { recursive: true })
    const bare = mkdtempSync(join(tmpdir(), 'skraft-bare-workspace-'))

    for (const workDir of [staged, bare]) {
      await executor.execute(stimulus, {
        workDir, model: 'claude-sonnet-4.6', timeout: 30_000, sessionLog: { rootDir: '/tmp/session-log' }, skills: [],
      })
    }

    const [withCli, withoutCli] = calls.sessions.map(({ customAgents }) => customAgents[0].prompt)
    strictEqual(withCli.includes(`${join(staged, '.skraft-plugin')}/src/cli/state.mjs`), true)
    strictEqual(withoutCli.includes('Evaluation runtime plugin root'), false)
  })

  it('publishes the dispatches that actually happened so a narrated fan-out cannot pass', async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'skraft-agent-artifacts-'))
    const dispatched = ['quality-gates-lens', 'architecture-boundaries-lens']
    const rawDispatchEvents = [
      ...dispatched.map((agent, index) => ({
        type: 'tool.execution_start',
        timestamp: `2026-08-13T10:00:0${index}.000Z`,
        data: { toolName: 'task', toolCallId: `call-${index}`, turnId: '0', arguments: { agent } },
      })),
      { type: 'assistant.message', timestamp: '2026-08-13T10:00:09.000Z', data: { content: 'NEEDS_REWORK' } },
    ]
    let eventHandler
    const session = {
      sessionId: 'session-4',
      on(handler) { eventHandler = handler },
      async sendAndWait() {
        for (const event of rawDispatchEvents) eventHandler(event)
        return { data: { content: 'NEEDS_REWORK' } }
      },
      async disconnect() {},
    }
    const executor = createAgentExecutor({
      repoRoot,
      createClient: () => ({
        async start() {},
        async createSession() { return session },
        async stop() {},
      }),
      permissionHandler: () => ({ kind: 'approve-once' }),
      adapterFactory: () => new CopilotAdapter(),
      computeMetrics,
      clock: { now: () => new Date('2026-08-13T10:00:10.000Z') },
      randomUUID: () => 'trajectory-4',
    })
    const stimulus = {
      name: 'delivery-review-fans-out',
      prompt: 'Review the delivered change and report a verdict.',
      tags: { agent: 'software-engineer-reviewer', subagents: dispatched, permissions: 'workspace-write' },
    }

    const trajectory = await executor.execute(stimulus, {
      workDir: '/tmp/work',
      model: 'claude-sonnet-4.6',
      timeout: 30_000,
      sessionLog: { rootDir: artifactDir },
      skills: [],
    })

    strictEqual(trajectory.artifactDir, artifactDir)
    const published = JSON.parse(readFileSync(join(artifactDir, 'custom_metrics.json'), 'utf8'))
    strictEqual(published.subagentDispatchCount, 2)
    for (const agent of dispatched) strictEqual(published.dispatchedSubagents.includes(agent), true)
  })

  it('separates the skills the dispatched sub-agent loaded from the ones the lead loaded', async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'skraft-agent-skill-metrics-'))
    const rawEventsWithSubagentSkills = [
      { type: 'skill.invoked', timestamp: '2026-08-29T10:00:00.000Z', data: { name: 'adversarial-review-lenses', path: '/tmp/work/.skills/adversarial-review-lenses/SKILL.md' } },
      { type: 'tool.execution_start', timestamp: '2026-08-29T10:00:01.000Z', data: { toolName: 'task', toolCallId: 'call-0', turnId: '0', arguments: { agent: 'software-engineer' } } },
      { type: 'skill.invoked', agentId: 'software-engineer', timestamp: '2026-08-29T10:00:02.000Z', data: { name: 'outside-in-tdd', path: '/tmp/work/.skills/outside-in-tdd/SKILL.md' } },
      { type: 'skill.invoked', agentId: 'software-engineer', timestamp: '2026-08-29T10:00:03.000Z', data: { name: 'craft-discipline', path: '/tmp/work/.skills/craft-discipline/SKILL.md' } },
      { type: 'assistant.message', timestamp: '2026-08-29T10:00:04.000Z', data: { content: 'blocked' } },
    ]
    let eventHandler
    const session = {
      sessionId: 'session-5',
      on(handler) { eventHandler = handler },
      async sendAndWait() {
        for (const event of rawEventsWithSubagentSkills) eventHandler(event)
        return { data: { content: 'blocked' } }
      },
      async disconnect() {},
    }
    const executor = createAgentExecutor({
      repoRoot,
      createClient: () => ({
        async start() {},
        async createSession() { return session },
        async stop() {},
      }),
      permissionHandler: () => ({ kind: 'approve-once' }),
      adapterFactory: () => new CopilotAdapter(),
      computeMetrics,
      clock: { now: () => new Date('2026-08-29T10:00:05.000Z') },
      randomUUID: () => 'trajectory-5',
    })
    const stimulus = {
      name: 'missing-distill-inputs-block-the-engineer',
      prompt: 'Resume the pipeline and report where delivery stands.',
      tags: { agent: 'skraft-orchestrator', subagents: ['software-engineer'] },
    }

    await executor.execute(stimulus, {
      workDir: '/tmp/work',
      model: 'claude-sonnet-4.6',
      timeout: 30_000,
      sessionLog: { rootDir: artifactDir },
      skills: [],
    })

    const published = JSON.parse(readFileSync(join(artifactDir, 'custom_metrics.json'), 'utf8'))
    strictEqual(published.rootSkillsLoaded, 'adversarial-review-lenses')
    strictEqual(published.subagentSkillsLoaded, 'software-engineer/outside-in-tdd software-engineer/craft-discipline')
  })

})
