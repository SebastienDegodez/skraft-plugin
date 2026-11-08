import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { main, parseAgentDescriptor } from '../../../scripts/agent-policy/build-config.mjs'

const capture = () => {
  const out = []
  const errs = []
  return { io: { log: (...a) => out.push(a.join(' ')), error: (...a) => errs.push(a.join(' ')) }, out, errs }
}

const agent = (lines) => ['---', 'name: software-engineer', 'description: "x"', ...lines, '---', '', '# body'].join('\n')

const fixtureDir = async (files) => {
  const dir = await mkdtemp(join(tmpdir(), 'build-config-'))
  const agents = join(dir, 'agents')
  await mkdir(agents, { recursive: true })
  for (const [name, content] of Object.entries(files)) await writeFile(join(agents, name), content)
  return { dir, agents }
}

test('parseAgentDescriptor reads the top-level skills, the on-demand skills and the metadata keys', () => {
  const d = parseAgentDescriptor(agent(['skills:', '  - outside-in-tdd', 'metadata:', '  on_demand_skills:', '    - mutation-testing']), { id: 'software-engineer' })
  assert.deepEqual(d, { id: 'software-engineer', name: 'software-engineer', skills: ['outside-in-tdd'], onDemandSkills: ['mutation-testing'], metadataKeys: ['on_demand_skills'] })
})

test('parseAgentDescriptor yields empty collections when frontmatter is absent', () => {
  assert.deepEqual(parseAgentDescriptor('# no fences'), { id: undefined, name: undefined, skills: [], onDemandSkills: [], metadataKeys: [] })
})

test('main validates the descriptors of a directory and writes no file', async () => {
  const { dir, agents } = await fixtureDir({ 'eng.md': agent(['skills:', '  - outside-in-tdd']) })
  const { io, out } = capture()
  assert.equal(main(['--dir', agents], io), 0)
  assert.ok(out.some((line) => /skill declarations and metadata are valid/.test(line)))
  await rm(dir, { recursive: true, force: true })
})

test('main rejects the retired --emit, --check and --apply flags', () => {
  for (const flag of ['--emit', '--check', '--apply']) assert.throws(() => main([flag], capture().io))
})

test('main fails (exit 1) and names the skill an agent lists as both mandatory and on-demand', async () => {
  const { dir, agents } = await fixtureDir({ 'eng.md': agent(['skills:', '  - mutation-testing', 'metadata:', '  on_demand_skills:', '    - mutation-testing']) })
  const { io, errs } = capture()
  assert.equal(main(['--dir', agents], io), 1)
  assert.ok(errs.some((l) => /software-engineer/.test(l) && /mutation-testing/.test(l) && /SKILL_DECLARED_TWICE/.test(l)))
  await rm(dir, { recursive: true, force: true })
})

test('main fails (exit 1) and names an agent that keeps a metadata field nothing reads', async () => {
  const { dir, agents } = await fixtureDir({ 'eng.md': agent(['metadata:', '  dispatched_by: skraft-orchestrator', '  skills:', '    - outside-in-tdd']) })
  const { io, errs } = capture()
  assert.equal(main(['--dir', agents], io), 1)
  assert.ok(errs.some((l) => /METADATA_FIELD_UNREAD/.test(l) && /dispatched_by/.test(l)))
  assert.ok(errs.some((l) => /SKILL_IN_METADATA/.test(l)))
  await rm(dir, { recursive: true, force: true })
})
