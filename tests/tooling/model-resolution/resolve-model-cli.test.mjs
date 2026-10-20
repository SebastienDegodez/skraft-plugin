import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  parseAgentFrontmatter,
  applyModel,
  checkClaudeAgent,
  planAgent,
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

test('parseAgentFrontmatter extracts name, model and requirement', () => {
  const fm = parseAgentFrontmatter(agent({ name: 'a', model: 'sonnet', requirement: 'Sonnet-class or above.' }))
  assert.equal(fm.name, 'a')
  assert.equal(fm.model, 'sonnet')
  assert.equal(fm.modelRequirement, 'Sonnet-class or above.')
})

test('parseAgentFrontmatter leaves model and requirement undefined when absent', () => {
  const fm = parseAgentFrontmatter(agent({ name: 'a' }))
  assert.equal(fm.model, undefined)
  assert.equal(fm.modelRequirement, undefined)
})

test('parseAgentFrontmatter does not confuse model_requirement with the model line', () => {
  const fm = parseAgentFrontmatter(agent({ name: 'a', model: 'inherit', requirement: 'Sonnet-class or above.' }))
  assert.equal(fm.model, 'inherit')
})

test('parseAgentFrontmatter ignores a legacy cost_role_class field', () => {
  const fm = parseAgentFrontmatter(agent({ name: 'a', model: 'haiku' }).replace('  skills:', '  cost_role_class: reviewer\n  skills:'))
  assert.deepEqual(fm, { name: 'a', model: 'haiku', modelRequirement: undefined })
  assert.deepEqual(checkClaudeAgent(agent({ name: 'a', model: 'haiku' }).replace('  skills:', '  cost_role_class: reviewer\n  skills:')), [])
})

test('parseAgentFrontmatter yields empty fields when there is no frontmatter', () => {
  const fm = parseAgentFrontmatter('# just a body, no fences')
  assert.equal(fm.name, undefined)
  assert.equal(fm.model, undefined)
})

// --- pure: parseAgentFrontmatter, model as a prioritized YAML list ---

const agentWithModelList = ({ name, items }) =>
  ['---', `name: ${name}`, 'description: "x"', 'model:', ...items.map((item) => ` - ${item}`), 'tools: read/readFile', '---', '', '# body'].join('\n')

test('parseAgentFrontmatter parses a model: block list into an array', () => {
  const fm = parseAgentFrontmatter(agentWithModelList({ name: 'a', items: ['Claude Sonnet 5', 'claude-sonnet-5', 'Claude Sonnet 4.6'] }))
  assert.deepEqual(fm.model, ['Claude Sonnet 5', 'claude-sonnet-5', 'Claude Sonnet 4.6'])
})

test('parseAgentFrontmatter parses a model: list even when the "model:" line has a trailing space', () => {
  const raw = agentWithModelList({ name: 'a', items: ['Claude Sonnet 5', 'claude-sonnet-5'] }).replace('model:\n', 'model: \n')
  assert.deepEqual(parseAgentFrontmatter(raw).model, ['Claude Sonnet 5', 'claude-sonnet-5'])
})

// --- pure: checkClaudeAgent ---

test('checkClaudeAgent accepts each family', () => {
  for (const model of ['haiku', 'sonnet', 'opus']) assert.deepEqual(checkClaudeAgent(agent({ name: 'a', model })), [])
})

test('checkClaudeAgent refuses a versioned name, inherit or no model outside the allow-list', () => {
  for (const model of ['Claude Sonnet 5', 'claude-haiku-5.5', 'inherit', undefined]) {
    assert.equal(checkClaudeAgent(agent({ name: 'a', model }), { allowList: new Set() }).length, 1, String(model))
  }
})

test('checkClaudeAgent lets the allow-listed orchestrator inherit', () => {
  assert.deepEqual(checkClaudeAgent(agent({ name: 'skraft-orchestrator', model: 'inherit' })), [])
})

test('checkClaudeAgent enforces the Sonnet-class floor', () => {
  assert.match(checkClaudeAgent(agent({ name: 'se', model: 'haiku', requirement: 'Sonnet-class or above.' }))[0], /floor 'sonnet'/)
  assert.deepEqual(checkClaudeAgent(agent({ name: 'se', model: 'sonnet', requirement: 'Sonnet-class or above.' })), [])
})

// --- pure: planAgent (Copilot file against its Claude Code pair's family) ---

test('planAgent skips a Copilot file that names no model', () => {
  const plan = planAgent(agent({ name: 'lens' }), { family: 'haiku', allowList: new Set() })
  assert.equal(plan.skipped, true)
  assert.equal(plan.reason, 'no model')
})

test('planAgent skips an allow-listed agent, by default the orchestrator', () => {
  const plan = planAgent(agent({ name: 'Skraft - Orchestrator', model: 'inherit' }))
  assert.equal(plan.skipped, true)
  assert.equal(plan.reason, 'allow-list')
})

test('planAgent leaves a model the pair family accepts alone, preferred or not', () => {
  for (const model of ['GPT-5.6 Luna', 'GPT-5.6 Luna (copilot)', 'gpt-5.6-luna', 'Claude Haiku 4.5']) {
    const plan = planAgent(agent({ name: 'r', model }), { family: 'haiku', allowList: new Set() })
    assert.equal(plan.changed, false, model)
    assert.equal(plan.resolvedModel, 'GPT-5.6 Luna')
  }
})

test('planAgent flags a model the pair family does not accept', () => {
  const plan = planAgent(agent({ name: 'r', model: 'Claude Sonnet 5' }), { family: 'haiku', allowList: new Set() })
  assert.equal(plan.changed, true)
})

test('planAgent treats a model list with one accepted entry as compliant', () => {
  const content = agentWithModelList({ name: 'a', items: ['Claude Sonnet 5', 'claude-sonnet-4.6'] })
  assert.equal(planAgent(content, { family: 'sonnet', allowList: new Set() }).changed, false)
  assert.equal(planAgent(agentWithModelList({ name: 'a', items: ['claude-sonnet-4.6'] }), { family: 'sonnet', allowList: new Set() }).changed, true)
})

test('planAgent flags a Copilot model whose Claude Code pair declares no family', () => {
  const plan = planAgent(agent({ name: 'r', model: 'GPT-5.6 Luna' }), { family: undefined, allowList: new Set() })
  assert.equal(plan.unpaired, true)
  assert.equal(plan.changed, true)
})

// --- pure: applyModel ---

test('applyModel rewrites only the top-level model line and collapses a list', () => {
  const after = applyModel(agentWithModelList({ name: 'a', items: ['claude-sonnet-4.6', 'claude-sonnet-4'] }), 'Claude Sonnet 5')
  assert.match(after, /^model: Claude Sonnet 5$/m)
  assert.doesNotMatch(after, /^\s+-\s*claude-sonnet-4\.6\s*$/m)
  assert.match(after, /^tools: read\/readFile$/m)
  assert.equal(applyModel(after, 'Claude Sonnet 5'), after)
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

const backlogLike = () => pluginFixture({
  copilot: {
    lens: agent({ name: 'lens', model: 'Claude Sonnet 5' }),
    planner: agent({ name: 'planner', model: 'Claude Sonnet 5' }),
    orch: agent({ name: 'Skraft - Orchestrator', model: 'inherit' }),
  },
  claude: {
    lens: agent({ name: 'lens', model: 'haiku' }),
    planner: agent({ name: 'planner', model: 'sonnet' }),
    orch: agent({ name: 'skraft-orchestrator', model: 'inherit' }),
  },
})

test('main --check reports a Copilot model that drifts from its pair family', async () => {
  const { root, copilotDir } = await backlogLike()
  const { io, errs } = capture()
  assert.equal(main(['--check', '--dir', copilotDir], io), 1)
  assert.deepEqual(errs.map((line) => line.split(',')[0]), ["drift: lens has 'Claude Sonnet 5'"])
  await rm(root, { recursive: true, force: true })
})

test('main --check reports a Claude Code file that declares no family', async () => {
  const { root, copilotDir } = await pluginFixture({ copilot: { a: agent({ name: 'A' }) }, claude: { a: agent({ name: 'a', model: 'claude-sonnet-5' }) } })
  const { io, errs } = capture()
  assert.equal(main(['--check', '--dir', copilotDir], io), 1)
  assert.match(errs[0], /^drift: a declares model 'claude-sonnet-5', expected one of: haiku \| sonnet \| opus$/)
  await rm(root, { recursive: true, force: true })
})

test('main --apply pins the preferred name of the pair family, then --check passes', async () => {
  const { root, copilotDir } = await backlogLike()
  assert.equal(main(['--apply', '--dir', copilotDir], capture().io), 0)
  assert.match(await readFile(join(copilotDir, 'lens.agent.md'), 'utf8'), /^model: GPT-5\.6 Luna$/m)
  assert.match(await readFile(join(copilotDir, 'planner.agent.md'), 'utf8'), /^model: Claude Sonnet 5$/m)
  assert.match(await readFile(join(copilotDir, 'orch.agent.md'), 'utf8'), /^model: inherit$/m)
  const { io, out } = capture()
  assert.equal(main(['--check', '--dir', copilotDir], io), 0)
  assert.ok(out.some((line) => /match policy/.test(line)))
  await rm(root, { recursive: true, force: true })
})

test('main --emit lists each pinned Copilot agent with its family and preferred model', async () => {
  const { root, copilotDir } = await backlogLike()
  const json = capture()
  main(['--emit', '--json', '--dir', copilotDir], json.io)
  const byName = Object.fromEntries(JSON.parse(json.out.join('\n')).map((row) => [row.name, row]))
  assert.equal(byName.lens.family, 'haiku')
  assert.equal(byName.lens.resolvedModel, 'GPT-5.6 Luna')
  assert.ok(!('Skraft - Orchestrator' in byName))
  const table = capture()
  main(['--emit', '--dir', copilotDir], table.io)
  assert.match(table.out.join('\n'), /^planner\tsonnet\tClaude Sonnet 5\.5$/m)
  await rm(root, { recursive: true, force: true })
})

test('main --forbid-model refuses a Copilot file that names a model, the orchestrator aside', async () => {
  const { root, copilotDir } = await pluginFixture({
    copilot: { lens: agent({ name: 'lens', model: 'claude-haiku-5.5' }), free: agent({ name: 'free' }), orch: agent({ name: 'skraft-orchestrator', model: 'inherit' }) },
    claude: { lens: agent({ name: 'lens', model: 'haiku' }), free: agent({ name: 'free', model: 'sonnet' }), orch: agent({ name: 'skraft-orchestrator', model: 'inherit' }) },
  })
  const { io, errs } = capture()
  assert.equal(main(['--check', '--forbid-model', '--dir', copilotDir], io), 1)
  assert.deepEqual(errs, ["drift: lens names the model 'claude-haiku-5.5'; the engine passes the model family at spawn"])
  await writeFile(join(copilotDir, 'lens.agent.md'), agent({ name: 'lens' }))
  assert.equal(main(['--check', '--forbid-model', '--dir', copilotDir], capture().io), 0)
  await rm(root, { recursive: true, force: true })
})
