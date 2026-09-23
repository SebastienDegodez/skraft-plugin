import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { fromHarnessInput } from '../../../plugins/skraft-framework/src/adapters/api/hooks/harness-input.mjs'
import { createPreToolUseCompositeService } from '../../../plugins/skraft-framework/src/application/pre-tool-use-composite.mjs'
import { createPreToolUseService } from '../../../plugins/skraft-framework/src/application/pre-tool-use-service.mjs'
import { createPreToolUseSessionGuardService } from '../../../plugins/skraft-framework/src/application/pre-tool-use-session-guard-service.mjs'

const pluginRoot = fileURLToPath(new URL('../../../plugins/skraft-framework/', import.meta.url))
const configPath = join(pluginRoot, 'skraft-framework.config.json')
const config = JSON.parse(await readFile(configPath, 'utf8'))
const manifest = JSON.parse(await readFile(join(pluginRoot, 'hooks/hooks.json'), 'utf8'))
const projectSlug = 'native-guard-regression'
const clock = { now: () => '2026-09-16T00:00:00.000Z' }
const researchState = () => ({ currentPhase: 'RESEARCH', phasesCompleted: [], phaseArtifacts: {}, verdicts: {} })

// Observe adapter -> composite at its dispatch port, with native and existing wire keys.
for (const field of ['subagent_type', 'subagentType']) {
  test(`Claude Agent ${field} reaches dispatch guard with requestedAgent and supplied projectSlug`, async () => {
    const calls = []
    const requestedAgent = config.phaseAgents.DELIVER.specialist
    const refusal = { decision: 'deny', message: 'RESEARCH specialist must run first' }
    const composite = createPreToolUseCompositeService({
      dispatchGuard: { handle: async (input) => { calls.push(input); return refusal } },
      sessionGuard: { handle: async () => ({ decision: 'allow' }) }
    })

    const result = await composite.handle(fromHarnessInput({
      hook_event_name: 'PreToolUse', tool_name: 'Agent', projectSlug,
      tool_input: { [field]: requestedAgent, prompt: 'Implement the approved story' }
    }, { env: {} }))

    assert.deepEqual(calls, [{ requestedAgent, projectSlug }])
    assert.deepEqual(result, refusal)
  })
}

// Exercise real dispatch policy through application boundary; mock only IO ports.
for (const requestedAgent of [
  config.phaseAgents.DELIVER.specialist,
  `skraft:${config.phaseAgents.DELIVER.specialist}`,
  'skraft:software-engineer',
  'other:software-engineer'
]) {
  test(`RESEARCH dispatch classifies ${requestedAgent} without confusing plugin namespaces`, async () => {
    const reads = []
    const records = []
    const guard = createPreToolUseService({
      config, clock,
      stateReader: { read: async (slug) => { reads.push(slug); return researchState() } },
      auditWriter: { write: async (record) => { records.push(record) } }
    })

    const result = await guard.handle({ requestedAgent, projectSlug })
    const foreign = requestedAgent === 'other:software-engineer'

    assert.deepEqual(reads, foreign ? [] : [projectSlug])
    assert.equal(result.decision, foreign ? 'allow' : 'deny')
    assert.equal(records.length, 1)
    assert.equal(records[0].code, foreign ? 'UNGOVERNED' : 'OUT_OF_ORDER')
    assert.equal(records[0].decision, foreign ? 'ALLOW' : 'DENY')
    assert.equal(records[0].expectedAgent, foreign ? null : config.phaseAgents.RESEARCH.specialist)
    assert.equal(records[0].projectSlug, projectSlug)
  })
}

for (const requestedAgent of [
  config.phaseAgents.DELIVER.specialist,
  `skraft:${config.phaseAgents.DELIVER.specialist}`,
  'skraft:software-engineer'
]) {
  test(`DELIVER dispatch recognizes conforming ${requestedAgent}`, async () => {
    const records = []
    const guard = createPreToolUseService({
      config, clock,
      stateReader: { read: async () => ({ ...researchState(), currentPhase: 'DELIVER' }) },
      auditWriter: { write: async (record) => { records.push(record) } }
    })
    assert.equal((await guard.handle({ requestedAgent, projectSlug })).decision, 'allow')
    assert.equal(records[0].code, 'CONFORMING')
    assert.equal(records[0].requestedAgent, requestedAgent)
    assert.equal(records[0].expectedAgent, config.phaseAgents.DELIVER.specialist)
  })
}

for (const agentName of ['skraft:software-engineer', 'other:software-engineer']) {
  test(`native DELIVER write checks monitored identity ${agentName}`, async () => {
    const records = []
    const guard = createPreToolUseSessionGuardService({
      config, clock,
      stateReader: { read: async () => ({ currentPhase: 'DELIVER' }) },
      auditWriter: { write: async (record) => { records.push(record) } }
    })
    const result = await guard.handle(fromHarnessInput({
      tool_name: 'Edit', agent_type: agentName, projectSlug,
      tool_input: { file_path: 'src/app.mjs', old_string: 'before', new_string: 'after' }
    }, { env: {} }))
    const monitored = agentName === 'skraft:software-engineer'
    assert.equal(result.decision, monitored ? 'allow' : 'deny')
    assert.equal(records[0].code, monitored ? 'CONFORMING' : 'UNMONITORED_WRITE')
    assert.equal(records[0].agentName, agentName)
  })
}

const matchingCommands = (toolName) => {
  const routes = (manifest.hooks.PreToolUse ?? []).filter(({ matcher }) =>
    !matcher || matcher === '*' || new RegExp(`^(?:${matcher})$`).test(toolName))
  assert.ok(routes.length > 0, `PreToolUse manifest must route native ${toolName} to a guard`)
  const commands = routes.flatMap(({ hooks }) => hooks ?? [])
    .filter(({ type }) => type === 'command')
    .map(({ command }) => command)
  assert.ok(commands.length > 0, `Matched ${toolName} routes must execute a command hook`)
  return commands
}

for (const toolName of ['Write', 'Edit']) {
  for (const protectedWrite of [true, false]) {
    test(`manifest-routed native ${toolName} ${protectedWrite ? 'denies state writes' : 'allows ordinary writes'}`, async (t) => {
      // No synthetic route or direct CLI fallback: missing registration is a behavior failure.
      const commands = matchingCommands(toolName)
      const cwd = await mkdtemp(join(tmpdir(), 'skraft-native-guard-'))
      t.after(() => rm(cwd, { recursive: true, force: true }))
      const auditLog = join(cwd, 'audit.jsonl')
      // An active pipeline, so the session guard has a phase to evaluate and audits it.
      const trackingRoot = join(cwd, '.copilot-tracking', 'skraft-plans')
      await mkdir(join(trackingRoot, projectSlug), { recursive: true })
      await writeFile(join(trackingRoot, '.active-slug'), `${projectSlug}\n`)
      await writeFile(join(trackingRoot, projectSlug, 'state.json'), JSON.stringify({ currentPhase: 'DESIGN' }))
      const filePath = protectedWrite
        ? join(cwd, '.copilot-tracking', 'skraft-plans', projectSlug, 'state.json')
        : join(cwd, 'src', 'ordinary.mjs')
      const toolInput = toolName === 'Write'
        ? { file_path: filePath, content: '{}' }
        : { file_path: filePath, old_string: '{}', new_string: '{"updated":true}' }
      const outputs = commands.map((command) => {
        // Execute the command declared by the matched route, including its actual CLI arguments.
        const child = spawnSync('/bin/sh', ['-c', command], {
          cwd,
          env: {
            ...process.env,
            PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}`,
            CLAUDE_PLUGIN_ROOT: pluginRoot, PLUGIN_ROOT: pluginRoot,
            SKRAFT_HARNESS: 'claude-code', SKRAFT_CONFIG: configPath,
            SKRAFT_AUDIT_LOG: auditLog,
            SKRAFT_TRACKING_ROOT: join(cwd, '.copilot-tracking', 'skraft-plans')
          },
          input: JSON.stringify({
            hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput,
            session_id: 'native-guard-regression', cwd
          }),
          encoding: 'utf8', timeout: 15000
        })
        assert.ifError(child.error)
        assert.equal(child.status, 0, `Hook failed: ${child.stderr}`)
        return child.stdout.trim() ? JSON.parse(child.stdout) : undefined
      })

      if (protectedWrite) {
        assert.ok(outputs.some((output) =>
          output?.hookSpecificOutput?.hookEventName === 'PreToolUse'
          && output.hookSpecificOutput.permissionDecision === 'deny'),
        `${toolName} on state.json must emit Claude permissionDecision deny`)
      } else {
        assert.ok(outputs.every((output) => output === undefined),
          `${toolName} on an ordinary source file must be allowed without a refusal`)
      }
      const records = (await readFile(auditLog, 'utf8')).trim().split('\n').map(JSON.parse)
      assert.ok(records.some((record) => record.event === 'SessionGuardEvaluated'
        && record.decision === (protectedWrite ? 'DENY' : 'ALLOW')
        && (!protectedWrite || record.code === 'STATE_WRITE_FORBIDDEN')),
      'Matched manifest route must actually reach the session guard')
    })
  }
}
for (const agentName of ['skraft:contract-testing-worker', 'mock-integration-worker', 'skraft:software-engineer-reviewer']) {
  test(`a DELIVER write by ${agentName}, dispatched from DELIVER, is monitored`, async () => {
    const guard = createPreToolUseSessionGuardService({
      config, clock,
      stateReader: { read: async () => ({ currentPhase: 'DELIVER' }) },
      auditWriter: { write: async () => {} }
    })
    const result = await guard.handle(fromHarnessInput({
      tool_name: 'Write', agent_type: agentName, projectSlug,
      tool_input: { file_path: 'tests/Orders.ContractTests/OrdersContractTests.cs', content: '// test' }
    }, { env: {} }))
    assert.equal(result.decision, 'allow')
  })
}

test('a DELIVER write by an agent outside the DELIVER dispatch tree is still refused', async () => {
  const guard = createPreToolUseSessionGuardService({
    config, clock,
    stateReader: { read: async () => ({ currentPhase: 'DELIVER' }) },
    auditWriter: { write: async () => {} }
  })
  const result = await guard.handle(fromHarnessInput({
    tool_name: 'Write', agent_type: 'skraft:solution-architect', projectSlug,
    tool_input: { file_path: 'src/Orders/Order.cs', content: '// code' }
  }, { env: {} }))
  assert.equal(result.decision, 'deny')
})
