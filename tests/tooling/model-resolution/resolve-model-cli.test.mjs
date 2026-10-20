import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  parseAgentFrontmatter,
  checkClaudeAgent,
  checkCopilotAgent,
  main,
} from '../../../scripts/agent-policy/resolve-model.mjs'

const agent = ({ name, model, requirement }) =>
  [
    '---',
    `name: ${name}`,
    'description: "x"',
    ...(model === undefined ? [] : [`model: ${model}`]),
    'tools: read/readFile',
    'metadata:',
    '  skills: [review]',
    ...(requirement ? [`  model_requirement: "${requirement}"`] : []),
    '---',
    '',
    '# body',
  ].join('\n')

// Capture console-like io so main() stays pure-ish and testable in-process.
const capture = () => {
  const out = []
  const errs = []
  return { io: { log: (...a) => out.push(a.join(' ')), error: (...a) => errs.push(a.join(' ')) }, out, errs }
}

// --- pure: parseAgentFrontmatter ---

test('parseAgentFrontmatter extracts name and model', () => {
  assert.deepEqual(parseAgentFrontmatter(agent({ name: 'a', model: 'sonnet', requirement: 'Sonnet-class or above.' })), { name: 'a', model: 'sonnet' })
})

test('parseAgentFrontmatter leaves model undefined when absent and empty when the line has no value', () => {
  assert.equal(parseAgentFrontmatter(agent({ name: 'a' })).model, undefined)
  assert.equal(parseAgentFrontmatter(agent({ name: 'a', model: '' })).model, '')
})

test('parseAgentFrontmatter does not confuse model_requirement with the model line', () => {
  assert.equal(parseAgentFrontmatter(agent({ name: 'a', model: 'inherit', requirement: 'Sonnet-class or above.' })).model, 'inherit')
})

test('parseAgentFrontmatter yields empty fields when there is no frontmatter', () => {
  assert.deepEqual(parseAgentFrontmatter('# just a body, no fences'), { name: undefined, model: undefined })
})

const agentWithModelList = ({ name, items }) =>
  ['---', `name: ${name}`, 'description: "x"', 'model:', ...items.map((item) => ` - ${item}`), 'tools: read/readFile', '---', '', '# body'].join('\n')

test('parseAgentFrontmatter parses a model: block list into an array, trailing space or not', () => {
  const raw = agentWithModelList({ name: 'a', items: ['Model A', 'model-b'] })
  assert.deepEqual(parseAgentFrontmatter(raw).model, ['Model A', 'model-b'])
  assert.deepEqual(parseAgentFrontmatter(raw.replace('model:\n', 'model: \n')).model, ['Model A', 'model-b'])
})

// --- pure: checkClaudeAgent ---

test('checkClaudeAgent accepts any model family word, the list stays open', () => {
  for (const model of ['haiku', 'sonnet', 'opus', 'gpt-luna', 'kimi', 'gemini']) assert.deepEqual(checkClaudeAgent(agent({ name: 'a', model })), [], model)
})

test('checkClaudeAgent refuses a versioned name, inherit, an empty or no model outside the allow-list', () => {
  for (const model of ['Display Name 5', 'vendor-model-5', 'inherit', '', undefined]) {
    assert.equal(checkClaudeAgent(agent({ name: 'a', model }), { allowList: new Set() }).length, 1, String(model))
  }
})

test('checkClaudeAgent refuses a model list', () => {
  assert.match(checkClaudeAgent(agentWithModelList({ name: 'a', items: ['sonnet', 'opus'] }))[0], /declares model 'sonnet, opus'/)
})

test('checkClaudeAgent lets the allow-listed orchestrator inherit', () => {
  assert.deepEqual(checkClaudeAgent(agent({ name: 'skraft-orchestrator', model: 'inherit' })), [])
})

// --- pure: checkCopilotAgent ---

test('checkCopilotAgent accepts no model or any non-empty model, refuses an empty one', () => {
  assert.deepEqual(checkCopilotAgent(agent({ name: 'a' })), [])
  assert.deepEqual(checkCopilotAgent(agent({ name: 'a', model: 'Any Display Name' })), [])
  assert.deepEqual(checkCopilotAgent(agentWithModelList({ name: 'a', items: ['Model A', 'model-b'] })), [])
  assert.deepEqual(checkCopilotAgent(agent({ name: 'a', model: '' })), ['a declares an empty model'])
})

// --- main() in-process over a temp plugin root with both trees ---

async function pluginFixture({ copilot, claude }) {
  const root = await mkdtemp(join(tmpdir(), 'skraft-agents-'))
  const copilotDir = join(root, 'com.github.copilot/agents')
  const claudeDir = join(root, 'com.anthropic.claude-code/agents')
  await mkdir(copilotDir, { recursive: true })
  await mkdir(claudeDir, { recursive: true })
  for (const [id, content] of Object.entries(copilot)) await writeFile(join(copilotDir, `${id}.agent.md`), content)
  for (const [id, content] of Object.entries(claude)) await writeFile(join(claudeDir, `${id}.md`), content)
  return { root, copilotDir, claudeDir }
}

test('main --check passes a backlog-like tree whose Copilot files pin any model', async () => {
  const { root, copilotDir } = await pluginFixture({
    copilot: {
      lens: agent({ name: 'lens', model: 'Some Display Name' }),
      planner: agent({ name: 'planner', model: 'another-model-id' }),
      orch: agent({ name: 'Skraft - Orchestrator', model: 'inherit' }),
    },
    claude: {
      lens: agent({ name: 'lens', model: 'haiku' }),
      planner: agent({ name: 'planner', model: 'gpt-terra' }),
      orch: agent({ name: 'skraft-orchestrator', model: 'inherit' }),
    },
  })
  const { io, out, errs } = capture()
  assert.equal(main(['--check', '--dir', copilotDir], io), 0)
  assert.deepEqual(errs, [])
  assert.ok(out.some((line) => /match policy/.test(line)))
  await rm(root, { recursive: true, force: true })
})

test('main --check reports a Claude Code file without a family and a Copilot file with an empty model', async () => {
  const { root, copilotDir } = await pluginFixture({
    copilot: { a: agent({ name: 'A', model: '' }), b: agent({ name: 'B' }) },
    claude: { a: agent({ name: 'a', model: 'vendor-sonnet-5' }), b: agent({ name: 'b', model: 'sonnet' }) },
  })
  const { io, errs } = capture()
  assert.equal(main(['--check', '--dir', copilotDir], io), 1)
  assert.deepEqual(errs, [
    "drift: a declares model 'vendor-sonnet-5', expected a model family: one kebab-case word such as sonnet or kimi",
    'drift: A declares an empty model',
  ])
  await rm(root, { recursive: true, force: true })
})

test('main refuses the retired --apply and --emit flags', () => {
  assert.throws(() => main(['--apply'], capture().io), /Unknown option '--apply'/)
  assert.throws(() => main(['--emit'], capture().io), /Unknown option '--emit'/)
})

test('main --forbid-model refuses a Copilot file that names a model, the orchestrator aside', async () => {
  const { root, copilotDir } = await pluginFixture({
    copilot: { lens: agent({ name: 'lens', model: 'Some Display Name' }), free: agent({ name: 'free' }), orch: agent({ name: 'skraft-orchestrator', model: 'inherit' }) },
    claude: { lens: agent({ name: 'lens', model: 'haiku' }), free: agent({ name: 'free', model: 'sonnet' }), orch: agent({ name: 'skraft-orchestrator', model: 'inherit' }) },
  })
  const { io, errs } = capture()
  assert.equal(main(['--check', '--forbid-model', '--dir', copilotDir], io), 1)
  assert.deepEqual(errs, ["drift: lens names the model 'Some Display Name'; the engine passes the model family at spawn"])
  await writeFile(join(copilotDir, 'lens.agent.md'), agent({ name: 'lens' }))
  assert.equal(main(['--check', '--forbid-model', '--dir', copilotDir], capture().io), 0)
  await rm(root, { recursive: true, force: true })
})
