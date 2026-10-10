import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { fromHarnessInput } from '../../../plugins/skraft-framework/src/adapters/api/hooks/harness-input.mjs'
import { createPreToolUseCompositeService } from '../../../plugins/skraft-framework/src/application/pre-tool-use-composite.mjs'
import { evaluateDispatch } from '../../../plugins/skraft-framework/src/domain/pipeline-policy.mjs'
import { createPreToolUseSessionGuardService } from '../../../plugins/skraft-framework/src/application/pre-tool-use-session-guard-service.mjs'

const pluginRoot = fileURLToPath(new URL('../../../plugins/skraft-framework/', import.meta.url))
const configPath = join(pluginRoot, 'skraft-framework.config.json')
const config = JSON.parse(await readFile(configPath, 'utf8'))
const manifest = JSON.parse(await readFile(join(pluginRoot, 'hooks/hooks.json'), 'utf8'))
const projectSlug = 'native-guard-regression'
const clock = { now: () => '2026-09-16T00:00:00.000Z' }

// Observe adapter -> composite at its provenance port, with native and existing wire keys.
for (const field of ['subagent_type', 'subagentType']) {
  test(`Claude Agent ${field} reaches the provenance guard with the caller and requestedAgent`, async () => {
    const calls = []
    const requestedAgent = config.phaseAgents.DELIVER.specialist
    const refusal = { decision: 'deny', message: 'outside the dispatch tree' }
    const composite = createPreToolUseCompositeService({
      provenanceGuard: { handle: async (input) => { calls.push(input); return refusal } },
      sessionGuard: { handle: async () => ({ decision: 'allow' }) }
    })

    const result = await composite.handle(fromHarnessInput({
      hook_event_name: 'PreToolUse', tool_name: 'Agent', agent_type: 'skraft:skraft-orchestrator', projectSlug,
      tool_input: { [field]: requestedAgent, prompt: 'Implement the approved story' }
    }, { env: {} }))

    assert.deepEqual(calls, [{ agentName: 'skraft:skraft-orchestrator', requestedAgent }])
    assert.deepEqual(result, refusal)
  })
}

// The dispatch order RunPipeline checks (G1, domain evaluateDispatch) tells plugin
// namespaces apart: a foreign software-engineer is not governed.
for (const requestedAgent of [
  config.phaseAgents.DELIVER.specialist,
  `skraft:${config.phaseAgents.DELIVER.specialist}`,
  'skraft:software-engineer',
  'other:software-engineer'
]) {
  test(`RESEARCH dispatch classifies ${requestedAgent} without confusing plugin namespaces`, () => {
    const result = evaluateDispatch(requestedAgent, { currentPhase: 'RESEARCH', specialistDone: false, reviewerVerdict: null }, config)
    const foreign = requestedAgent === 'other:software-engineer'
    assert.equal(result.ok, foreign)
    if (foreign) assert.equal(result.value.stage, 'UNGOVERNED')
    else {
      assert.equal(result.error.code, 'OUT_OF_ORDER')
      assert.equal(result.error.expectedAgent, config.phaseAgents.RESEARCH.specialist)
    }
  })
}

for (const requestedAgent of [
  config.phaseAgents.DELIVER.specialist,
  `skraft:${config.phaseAgents.DELIVER.specialist}`,
  'skraft:software-engineer'
]) {
  test(`DELIVER dispatch recognizes conforming ${requestedAgent}`, () => {
    const result = evaluateDispatch(requestedAgent, { currentPhase: 'DELIVER', specialistDone: false, reviewerVerdict: null }, config)
    assert.equal(result.ok, true)
    assert.equal(result.value.stage, 'SPECIALIST')
    assert.equal(result.value.expectedAgent, config.phaseAgents.DELIVER.specialist)
  })
}

for (const agentName of ['skraft:skraft-orchestrator', 'plugin:skraft:skraft-orchestrator']) {
  test(`native Edit by ${agentName}: src/ and tests/ are refused`, async () => {
    const records = []
    const guard = createPreToolUseSessionGuardService({
      config, clock,
      auditWriter: { write: async (record) => { records.push(record) } }
    })
    for (const file_path of ['src/app.mjs', 'tests/app.test.mjs']) {
      const result = await guard.handle(fromHarnessInput({
        tool_name: 'Edit', agent_type: agentName, projectSlug,
        tool_input: { file_path, old_string: 'before', new_string: 'after' }
      }, { env: {} }))
      assert.equal(result.decision, 'deny', file_path)
    }
    assert.deepEqual(records.map(({ code }) => code), ['WRITE_RIGHT_DENIED', 'WRITE_RIGHT_DENIED'])
  })
}

for (const [agentName, code] of [['skraft:software-engineer', 'CONFORMING'], ['other:software-engineer', 'NOT_GOVERNED']]) {
  test(`native Edit by ${agentName}: src/ passes, tracked state is refused`, async () => {
    const records = []
    const guard = createPreToolUseSessionGuardService({
      config, clock,
      auditWriter: { write: async (record) => { records.push(record) } }
    })
    const edit = (file_path) => guard.handle(fromHarnessInput({
      tool_name: 'Edit', agent_type: agentName, projectSlug,
      tool_input: { file_path, old_string: 'before', new_string: 'after' }
    }, { env: {} }))
    assert.equal((await edit('src/app.mjs')).decision, 'allow')
    assert.equal((await edit(`.copilot-tracking/skraft-plans/${projectSlug}/state.json`)).decision, 'deny')
    assert.deepEqual(records.map(({ code, agentName: name }) => ({ code, name })),
      [{ code, name: agentName }, { code: 'STATE_WRITE_FORBIDDEN', name: agentName }])
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
        // sh through PATH, as the harnesses run hooks: Git Bash provides it on Windows.
        const child = spawnSync('sh', ['-c', command], {
          cwd,
          env: {
            ...process.env,
            PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ''}`,
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
