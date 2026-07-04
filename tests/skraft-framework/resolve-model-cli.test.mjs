import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  parseAgentFrontmatter,
  applyModel,
  planAgent,
  main,
} from '../../plugins/src/cli/resolve-model.mjs'

const agent = ({ name, model = 'inherit', cls = 'reviewer', requirement }) =>
  [
    '---',
    `name: ${name}`,
    'description: "x"',
    `model: ${model}`,
    'tools: read/readFile',
    'metadata:',
    `  cost_role_class: ${cls}  # B12 target class`,
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

test('parseAgentFrontmatter extracts name, model, class and requirement', () => {
  const fm = parseAgentFrontmatter(agent({ name: 'a', model: 'inherit', cls: 'implementer', requirement: 'Sonnet-class or above.' }))
  assert.equal(fm.name, 'a')
  assert.equal(fm.model, 'inherit')
  assert.equal(fm.costRoleClass, 'implementer')
  assert.equal(fm.modelRequirement, 'Sonnet-class or above.')
})

test('parseAgentFrontmatter leaves requirement undefined when absent', () => {
  const fm = parseAgentFrontmatter(agent({ name: 'a' }))
  assert.equal(fm.modelRequirement, undefined)
})

test('parseAgentFrontmatter does not confuse model_requirement with the model line', () => {
  const fm = parseAgentFrontmatter(agent({ name: 'a', model: 'inherit', requirement: 'Sonnet-class or above.' }))
  assert.equal(fm.model, 'inherit')
})

test('parseAgentFrontmatter yields empty fields when there is no frontmatter', () => {
  const fm = parseAgentFrontmatter('# just a body, no fences')
  assert.equal(fm.name, undefined)
  assert.equal(fm.costRoleClass, undefined)
})

// --- pure: planAgent ---

test('planAgent marks a reviewer to be changed from inherit to haiku', () => {
  const plan = planAgent(agent({ name: 'r', cls: 'reviewer' }), { allowList: new Set() })
  assert.equal(plan.skipped, false)
  assert.equal(plan.currentModel, 'inherit')
  assert.equal(plan.resolvedModel, 'claude-haiku-4.5')
  assert.equal(plan.changed, true)
})

test('planAgent applies the Sonnet floor override for a reviewer with a requirement', () => {
  const plan = planAgent(
    agent({ name: 'se-rev', cls: 'reviewer', requirement: 'Sonnet-class or above.' }),
    { allowList: new Set() },
  )
  assert.equal(plan.resolvedModel, 'Claude Sonnet 5')
})

test('planAgent skips an allow-listed agent', () => {
  const plan = planAgent(agent({ name: 'skraft-orchestrator', cls: 'reviewer' }), {
    allowList: new Set(['skraft-orchestrator']),
  })
  assert.equal(plan.skipped, true)
  assert.equal(plan.reason, 'allow-list')
})

test('planAgent uses the default allow-list (orchestrator) when none is provided', () => {
  const plan = planAgent(agent({ name: 'skraft-orchestrator', cls: 'reviewer' }))
  assert.equal(plan.skipped, true)
  assert.equal(plan.reason, 'allow-list')
})

test('planAgent skips an agent that has no cost_role_class', () => {
  const noClass = ['---', 'name: x', 'model: inherit', '---', ''].join('\n')
  const plan = planAgent(noClass, { allowList: new Set() })
  assert.equal(plan.skipped, true)
  assert.equal(plan.reason, 'no cost_role_class')
})

test('planAgent reports changed=false when the model already matches', () => {
  const plan = planAgent(agent({ name: 'r', model: 'claude-haiku-4.5', cls: 'reviewer' }), {
    allowList: new Set(),
  })
  assert.equal(plan.changed, false)
})

// --- pure: applyModel ---

test('applyModel rewrites only the top-level model line', () => {
  const before = agent({ name: 'r', model: 'inherit', cls: 'reviewer', requirement: 'Sonnet-class or above.' })
  const after = applyModel(before, 'claude-haiku-4.5')
  assert.match(after, /^model: claude-haiku-4\.5$/m)
  assert.match(after, /model_requirement: "Sonnet-class or above\."/)
  assert.doesNotMatch(after, /^model: inherit$/m)
})

test('applyModel is idempotent', () => {
  const once = applyModel(agent({ name: 'r', cls: 'reviewer' }), 'claude-haiku-4.5')
  const twice = applyModel(once, 'claude-haiku-4.5')
  assert.equal(twice, once)
})

// --- main() in-process over a temp agent dir ---

async function fixtureDir() {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-agents-'))
  const agents = join(dir, 'agents')
  await mkdir(join(agents, 'nested'), { recursive: true })
  await writeFile(join(agents, 'rev.agent.md'), agent({ name: 'rev', cls: 'reviewer' }))
  await writeFile(join(agents, 'impl.agent.md'), agent({ name: 'impl', cls: 'implementer' }))
  await writeFile(join(agents, 'nested', 'lens.agent.md'), agent({ name: 'lens', cls: 'reviewer' }))
  await writeFile(join(agents, 'orch.agent.md'), agent({ name: 'skraft-orchestrator', cls: 'reviewer' }))
  return { dir, agents }
}

test('main --check returns 1 and reports drift when agents do not match policy', async () => {
  const { dir, agents } = await fixtureDir()
  const { io, errs } = capture()
  const code = main(['--check', '--dir', agents], io)
  assert.equal(code, 1)
  assert.ok(errs.some((line) => /drift: rev .* expected 'claude-haiku-4\.5'/.test(line)))
  await rm(dir, { recursive: true, force: true })
})

test('main --apply pins models, leaves the orchestrator on inherit, then --check passes', async () => {
  const { dir, agents } = await fixtureDir()

  assert.equal(main(['--apply', '--dir', agents], capture().io), 0)

  assert.match(await readFile(join(agents, 'rev.agent.md'), 'utf8'), /^model: claude-haiku-4\.5$/m)
  assert.match(await readFile(join(agents, 'impl.agent.md'), 'utf8'), /^model: Claude Sonnet 5$/m)
  assert.match(await readFile(join(agents, 'nested', 'lens.agent.md'), 'utf8'), /^model: claude-haiku-4\.5$/m)
  assert.match(await readFile(join(agents, 'orch.agent.md'), 'utf8'), /^model: inherit$/m)

  const { io, out } = capture()
  assert.equal(main(['--check', '--dir', agents], io), 0)
  assert.ok(out.some((line) => /match policy/.test(line)))

  await rm(dir, { recursive: true, force: true })
})

test('main --apply is idempotent (second pass changes nothing)', async () => {
  const { dir, agents } = await fixtureDir()
  main(['--apply', '--dir', agents], capture().io)
  const before = await readFile(join(agents, 'rev.agent.md'), 'utf8')
  main(['--apply', '--dir', agents], capture().io)
  const after = await readFile(join(agents, 'rev.agent.md'), 'utf8')
  assert.equal(after, before)
  await rm(dir, { recursive: true, force: true })
})

test('main --emit --json lists resolved models and omits allow-listed agents', async () => {
  const { dir, agents } = await fixtureDir()
  const { io, out } = capture()
  main(['--emit', '--json', '--dir', agents], io)
  const rows = JSON.parse(out.join('\n'))
  const byName = Object.fromEntries(rows.map((r) => [r.name, r.resolvedModel]))
  assert.equal(byName.rev, 'claude-haiku-4.5')
  assert.equal(byName.impl, 'Claude Sonnet 5')
  assert.equal(byName.lens, 'claude-haiku-4.5')
  assert.ok(!('skraft-orchestrator' in byName))
  await rm(dir, { recursive: true, force: true })
})

test('main --emit without --json prints a tab-separated table', async () => {
  const { dir, agents } = await fixtureDir()
  const { io, out } = capture()
  main(['--emit', '--dir', agents], io)
  const text = out.join('\n')
  assert.match(text, /^rev\tclaude-haiku-4\.5$/m)
  assert.match(text, /^impl\tClaude Sonnet 5$/m)
  assert.doesNotMatch(text, /skraft-orchestrator/)
  await rm(dir, { recursive: true, force: true })
})
