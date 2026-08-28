import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseAgentDescriptor, main } from '../../plugins/skraft-framework/src/cli/build-config.mjs'

// Capture console-like io so main() stays testable in-process.
const capture = () => {
  const out = []
  const errs = []
  return { io: { log: (...a) => out.push(a.join(' ')), error: (...a) => errs.push(a.join(' ')) }, out, errs }
}

const specialist = ({ name, phase, skills = [], instructions = [], inputs = [], outputs = [] }) =>
  [
    '---',
    `name: ${name}`,
    'description: "x"',
    'metadata:',
    `  dispatched_by: skraft-orchestrator`,
    `  phase: ${phase}`,
    ...(skills.length ? ['  skills:', ...skills.map((s) => `    - ${s}`)] : []),
    ...(instructions.length ? ['  instructions:', ...instructions.map((path) => `    - ${path}`)] : []),
    '  inputs:',
    '    required:',
    ...inputs.map((i) => `      - ${i}`),
    '  outputs:',
    ...outputs.map((o) => `    - ${o}`),
    '---',
    '',
    '# body',
  ].join('\n')

const orchestrator = (phases) =>
  [
    '---',
    'name: skraft-orchestrator',
    'description: "x"',
    'metadata:',
    '  phases:',
    ...phases.map((p) => `    - ${p}`),
    '---',
    '',
    '# body',
  ].join('\n')

// --- pure: parseAgentDescriptor ---

test('parseAgentDescriptor extracts identity, phase, dispatch, skills, instructions and artifacts', () => {
  const d = parseAgentDescriptor(
    specialist({
      name: 'solution-architect',
      phase: 'DESIGN',
      skills: ['architecture-patterns', 'architecture-decisions'],
      instructions: ['plugins/skraft-framework/com.github.copilot/rules/skraft-artifacts.instructions.md'],
      inputs: ['stories.md'],
      outputs: ['adr.md', 'diagrams.md'],
    }),
    { id: 'solution-architect' },
  )
  assert.equal(d.id, 'solution-architect')
  assert.equal(d.name, 'solution-architect')
  assert.equal(d.phase, 'DESIGN')
  assert.equal(d.dispatchedBy, 'skraft-orchestrator')
  assert.deepEqual(d.skills, ['architecture-patterns', 'architecture-decisions'])
  assert.deepEqual(d.instructions, ['plugins/skraft-framework/com.github.copilot/rules/skraft-artifacts.instructions.md'])
  assert.deepEqual(d.inputs, ['stories.md'])
  assert.deepEqual(d.outputs, ['adr.md', 'diagrams.md'])
})

test('parseAgentDescriptor reads the orchestrator phase order from metadata.phases', () => {
  const d = parseAgentDescriptor(orchestrator(['DISCOVER', 'DISCUSS', 'DESIGN', 'DISTILL', 'DELIVER']))
  assert.deepEqual(d.phases, ['DISCOVER', 'DISCUSS', 'DESIGN', 'DISTILL', 'DELIVER'])
})

test('parseAgentDescriptor yields empty collections when frontmatter is absent', () => {
  const d = parseAgentDescriptor('# no fences')
  assert.equal(d.name, undefined)
  assert.deepEqual(d.skills, [])
  assert.deepEqual(d.instructions, [])
  assert.deepEqual(d.inputs, [])
  assert.deepEqual(d.outputs, [])
})

// --- main() in-process over a temp agent dir ---

async function fixtureDir() {
  const dir = await mkdtemp(join(tmpdir(), 'skraft-cfg-build-'))
  const agents = join(dir, 'agents')
  await mkdir(agents, { recursive: true })
  await writeFile(join(agents, 'orch.agent.md'), orchestrator(['DESIGN', 'DELIVER']))
  await writeFile(
    join(agents, 'arch.agent.md'),
    specialist({ name: 'solution-architect', phase: 'DESIGN', skills: ['architecture-patterns'] }),
  )
  await writeFile(join(agents, 'arch-rev.agent.md'), specialist({ name: 'solution-architect-reviewer', phase: 'DESIGN' }))
  await writeFile(join(agents, 'eng.agent.md'), specialist({ name: 'software-engineer', phase: 'DELIVER' }))
  await writeFile(join(agents, 'eng-rev.agent.md'), specialist({ name: 'software-engineer-reviewer', phase: 'DELIVER' }))
  const out = join(dir, 'skraft-framework.config.json')
  return { dir, agents, out }
}

test('main --apply writes a config JSON derived from the agent descriptors', async () => {
  const { dir, agents, out } = await fixtureDir()
  const code = main(['--apply', '--dir', agents, '--out', out], capture().io)
  assert.equal(code, 0)
  const config = JSON.parse(await readFile(out, 'utf8'))
  assert.deepEqual(config.phaseOrder, ['DESIGN', 'DELIVER'])
  assert.deepEqual(config.phaseAgents.DESIGN, {
    specialist: 'solution-architect',
    reviewer: 'solution-architect-reviewer',
  })
  assert.deepEqual(config.agentSkills['solution-architect'], [{ name: 'architecture-patterns', policy: 'verify' }])
  await rm(dir, { recursive: true, force: true })
})

test('main --check returns 0 when the committed config matches the descriptors', async () => {
  const { dir, agents, out } = await fixtureDir()
  main(['--apply', '--dir', agents, '--out', out], capture().io)
  const { io, out: logs } = capture()
  const code = main(['--check', '--dir', agents, '--out', out], io)
  assert.equal(code, 0)
  assert.ok(logs.some((l) => /in sync/.test(l)))
  await rm(dir, { recursive: true, force: true })
})

test('main --check returns 1 and reports drift when the committed config is stale', async () => {
  const { dir, agents, out } = await fixtureDir()
  await writeFile(out, JSON.stringify({ phaseOrder: ['STALE'] }, null, 2))
  const { io, errs } = capture()
  const code = main(['--check', '--dir', agents, '--out', out], io)
  assert.equal(code, 1)
  assert.ok(errs.some((l) => /out of sync/.test(l)))
  await rm(dir, { recursive: true, force: true })
})

test('main --check returns 1 when no committed config exists yet', async () => {
  const { dir, agents, out } = await fixtureDir()
  const { io, errs } = capture()
  const code = main(['--check', '--dir', agents, '--out', out], io)
  assert.equal(code, 1)
  assert.ok(errs.some((l) => /out of sync/.test(l)))
  await rm(dir, { recursive: true, force: true })
})

test('main fails (exit 1) and names the orphan when an agent declares no parent', async () => {
  const { dir, agents, out } = await fixtureDir()
  await writeFile(
    join(agents, 'orphan.agent.md'),
    ['---', 'name: orphan-agent', 'description: "x"', 'metadata:', '  phase: DESIGN', '---', '', '# body'].join('\n'),
  )
  const { io, errs } = capture()
  const code = main(['--check', '--dir', agents, '--out', out], io)
  assert.equal(code, 1)
  assert.ok(errs.some((l) => /orphan-agent/.test(l) && /ORPHAN_AGENT/.test(l)))
  await rm(dir, { recursive: true, force: true })
})

test('main --emit --json prints the config without writing a file', async () => {
  const { dir, agents } = await fixtureDir()
  const { io, out: logs } = capture()
  const code = main(['--emit', '--json', '--dir', agents], io)
  assert.equal(code, 0)
  const config = JSON.parse(logs.join('\n'))
  assert.deepEqual(config.phaseOrder, ['DESIGN', 'DELIVER'])
  await rm(dir, { recursive: true, force: true })
})
