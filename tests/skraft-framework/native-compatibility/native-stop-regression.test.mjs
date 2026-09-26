import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSubagentStopService } from '../../../plugins/skraft-framework/src/application/subagent-stop-service.mjs'
import { createJsonlTranscriptReader } from '../../../plugins/skraft-framework/src/adapters/infrastructure/jsonl-transcript-reader.mjs'

// Tests only: existing factories, real config and reader; no real tracking state.
// Proposed payload additions: agent_transcript_path and reader option maxBytes.
// Native files may live outside the workspace; no workspace-only allowlist assumed.
const config = JSON.parse(readFileSync(new URL(
  '../../../plugins/skraft-framework/skraft-framework.config.json', import.meta.url
), 'utf8'))
const engineer = config.phaseAgents.DELIVER.specialist
const projectSlug = 'native-stop-regression'
const requiredSkills = config.agentSkills[engineer].map((entry) => entry.name)
const identities = [
  engineer,
  'software-engineer',
  'skraft:software-engineer',
  `skraft:${engineer}`
]

const skillReads = (names = requiredSkills) => names.map((name, index) => ({
  type: 'assistant',
  message: {
    role: 'assistant',
    content: [{
      type: 'tool_use', id: `read-${index}`, name: 'Read',
      input: { file_path: `/fixture/skills/${name}/SKILL.md` }
    }]
  }
}))
const noSkills = [{ type: 'assistant', message: { role: 'assistant', content: 'Work complete.' } }]
const jsonl = (entries) => entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n'
const harness = () => {
  const audits = []
  const service = createSubagentStopService({
    config,
    transcriptReaderFactory: createJsonlTranscriptReader,
    auditWriter: { write: async (entry) => { audits.push(entry) } },
    clock: { now: () => '2026-09-16T00:00:00.000Z' }
  })
  return { service, audits }
}

const auditFor = (h, eventType) => h.audits.find((entry) => entry.eventType === eventType)
const assertUnavailable = (h) => {
  const audit = auditFor(h, 'SkillComplianceChecked')
  assert.equal(audit?.reason, 'transcript_unavailable')
  assert.equal(audit.decision, 'ALLOW', 'only transcript monitoring fails open')
}

const temporaryDirectory = async (t) => {
  // macOS tmpdir may traverse /var -> /private/var; safe fixtures use its real path.
  const root = await realpath(await mkdtemp(join(tmpdir(), 'skraft-native-stop-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}
const transcriptFile = async (root, name, entries) => {
  const path = join(root, name)
  await writeFile(path, jsonl(entries), 'utf8')
  return path
}

// Convert an unsupported path read into an assertion failure, not an uncaught
// TRANSCRIPT_UNAVAILABLE error masquerading as RED for a missing API.
const readableTranscript = async (payload) => {
  let content
  let error
  try { content = await createJsonlTranscriptReader(payload).read() } catch (caught) { error = caught }
  assert.equal(error, undefined, `regular child JSONL must be readable: ${error?.message}`)
  assert.equal(typeof content, 'string')
  return content
}

for (const agentName of identities) {
  test(`native stop: ${agentName} enforces configured required skills`, async () => {
    const h = harness()
    const result = await h.service.handle({ agentName, transcript: noSkills })
    assert.equal(result.decision, 'block')
    assert.deepEqual(auditFor(h, 'SkillComplianceChecked')?.missingSkills, requiredSkills)
    assert.equal(auditFor(h, 'SkillComplianceChecked')?.reason, 'skill_absent')
  })


}

test('native stop: inline transcript still supports required-skill compliance', async () => {
  const h = harness()
  const result = await h.service.handle({ agentName: engineer, transcript: skillReads() })
  assert.equal(result.decision, 'allow')
  assert.equal(auditFor(h, 'SkillComplianceChecked')?.reason, 'all_present')
  assert.deepEqual(auditFor(h, 'SkillComplianceChecked')?.missingSkills, [])
})

test('native reader: inline transcript remains supported', async () => {
  const transcript = skillReads()
  assert.deepEqual(JSON.parse(await readableTranscript({ transcript })), transcript)
})

test('native reader: reads real child JSONL outside workspace, not parent transcript_path', async (t) => {
  const root = await temporaryDirectory(t)
  const child = await transcriptFile(root, 'child.jsonl', skillReads())
  const parent = await transcriptFile(root, 'parent.jsonl', noSkills)
  const content = await readableTranscript({ agent_transcript_path: child, transcript_path: parent })
  for (const skill of requiredSkills) assert.ok(content.includes(`${skill}/SKILL.md`))
  assert.ok(!content.includes('Work complete.'), 'parent content must not supply child evidence')
})

for (const childHasSkills of [true, false]) {
  test(`native stop: child ${childHasSkills ? 'has' : 'lacks'} skills; opposite parent cannot change compliance`, async (t) => {
    const root = await temporaryDirectory(t)
    const child = await transcriptFile(root, 'child.jsonl', childHasSkills ? skillReads() : noSkills)
    const parent = await transcriptFile(root, 'parent.jsonl', childHasSkills ? noSkills : skillReads())
    const h = harness()
    const result = await h.service.handle({
      agentName: engineer, agent_transcript_path: child, transcript_path: parent
    })
    assert.equal(result.decision, childHasSkills ? 'allow' : 'block')
    const compliance = auditFor(h, 'SkillComplianceChecked')
    assert.equal(compliance?.reason, childHasSkills ? 'all_present' : 'skill_absent')
    assert.deepEqual(compliance.missingSkills, childHasSkills ? [] : requiredSkills)
  })
}

test('native stop: a readable child transcript with every skill read lets the agent stop', async (t) => {
  const root = await temporaryDirectory(t)
  const child = await transcriptFile(root, 'child.jsonl', skillReads())
  const h = harness()
  const result = await h.service.handle({ agentName: engineer, agent_transcript_path: child, projectSlug })
  assert.equal(auditFor(h, 'SkillComplianceChecked')?.reason, 'all_present')
  assert.equal(result.decision, 'allow')
})

for (const kind of ['absent', 'missing-file', 'directory', 'symlink']) {
  test(`native stop: ${kind} child path is unavailable and never falls back to the parent`, async (t) => {
    const root = await temporaryDirectory(t)
    const parent = await transcriptFile(root, 'parent.jsonl', skillReads())
    let child
    if (kind === 'missing-file') child = join(root, 'not-created.jsonl')
    if (kind === 'directory') child = root
    if (kind === 'symlink') {
      // Both the link and its external target belong to this test, never host data.
      const external = await temporaryDirectory(t)
      const target = await transcriptFile(external, 'target.jsonl', skillReads())
      child = join(root, 'linked-child.jsonl')
      await symlink(target, child)
    }
    const payload = { agent_transcript_path: child, transcript_path: parent }
    await assert.rejects(() => createJsonlTranscriptReader(payload).read(),
      'absent or unsafe child paths must not fall back to the parent')
    const h = harness()
    const result = await h.service.handle({ agentName: engineer, projectSlug, ...payload })
    assertUnavailable(h)
    assert.equal(result.decision, 'allow', 'an unavailable transcript is a monitoring failure, not a verdict')
  })
}

test('native reader: regular JSONL within explicit byte budget is readable', async (t) => {
  const root = await temporaryDirectory(t)
  const child = await transcriptFile(root, 'child.jsonl', skillReads())
  const maxBytes = Buffer.byteLength(jsonl(skillReads()), 'utf8') + 1
  const content = await readableTranscript({ agent_transcript_path: child, maxBytes })
  assert.ok(content.includes('outside-in-tdd/SKILL.md'))
})

test('native reader: oversized regular JSONL is unavailable, never a truncated compliance transcript', async (t) => {
  const root = await temporaryDirectory(t)
  const entries = [...skillReads(), { type: 'assistant', message: { content: 'x'.repeat(8192) } }]
  const child = await transcriptFile(root, 'large-child.jsonl', entries)
  await assert.rejects(() => createJsonlTranscriptReader({
    agent_transcript_path: child, maxBytes: 4096
  }).read(), 'byte limit must reject even when all required reads precede oversized tail')
})