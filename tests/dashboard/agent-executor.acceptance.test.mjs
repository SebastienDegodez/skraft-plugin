import { createHash } from 'node:crypto'
import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import { computeMetrics } from '@microsoft/vally'
import { CopilotAdapter } from '@microsoft/vally/trajectory'

import { createAgentExecutor } from '../../eng/vally-agent-executor/executor.mjs'

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'))
const agentPath = join(repoRoot, 'plugins/skraft-framework/agents/software-engineer.agent.md')
const relativeAgentPath = relative(repoRoot, agentPath).split('\\').join('/')
const expectedHash = createHash('sha256').update(readFileSync(agentPath)).digest('hex')
const activatedSkills = ['outside-in-tdd', 'red-synthesize-green', 'craft-discipline']
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
    strictEqual(trajectory.output, blockedOutput)
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

})
