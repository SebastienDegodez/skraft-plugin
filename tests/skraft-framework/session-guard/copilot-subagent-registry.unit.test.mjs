// Unit — the Copilot sub-agent registry: SubagentStart remembers the parent transcript,
// PreToolUse resolves a sub-agent session to the agent its `subagent.started` event names.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCopilotSubagentRegistry } from '../../../plugins/skraft-framework/src/adapters/infrastructure/copilot-subagent-registry.mjs'

const started = (agentId, agentName, { nested = false } = {}) => JSON.stringify(nested
  ? { type: 'subagent.started', data: { agentId, agentName } }
  : { type: 'subagent.started', data: { toolCallId: agentId, agentName }, agentId })

const withDir = async (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'skraft-registry-'))
  try { await fn(dir) } finally { rmSync(dir, { recursive: true, force: true }) }
}

test('registry: a remembered transcript resolves its sub-agent sessions, top-level or nested agentId', async () => {
  await withDir(async (dir) => {
    const transcript = join(dir, 'events.jsonl')
    writeFileSync(transcript, [
      JSON.stringify({ type: 'session.start', data: { sessionId: 'parent' } }),
      '{ not json subagent.started child',
      JSON.stringify({ type: 'tool.execution_start', data: { note: 'subagent.started child' }, agentId: 'child' }),
      started('child', 'skraft:software-engineer'),
      started('lens', 'architecture-boundaries-lens', { nested: true }),
    ].join('\n'))
    const registry = createCopilotSubagentRegistry({ path: join(dir, 'skraft', 'copilot-subagents.json') })

    assert.equal(await registry.agentNameOf('child'), null, 'nothing remembered yet')
    await registry.remember({ transcriptPath: transcript })
    assert.equal(await registry.agentNameOf('child'), 'skraft:software-engineer')
    assert.equal(await registry.agentNameOf('lens'), 'architecture-boundaries-lens')
    assert.equal(await registry.agentNameOf('parent'), null)
    assert.equal(await registry.agentNameOf(''), null)
    assert.equal(await registry.agentNameOf(undefined), null)
  })
})

test('registry: a resolved session is cached, so a lost transcript still names it', async () => {
  await withDir(async (dir) => {
    const transcript = join(dir, 'events.jsonl')
    writeFileSync(transcript, started('child', 'skraft:software-engineer'))
    const path = join(dir, 'copilot-subagents.json')
    const registry = createCopilotSubagentRegistry({ path })
    await registry.remember({ transcriptPath: transcript })
    await registry.agentNameOf('child')

    rmSync(transcript)
    assert.equal(await registry.agentNameOf('child'), 'skraft:software-engineer')
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')).agents, { child: 'skraft:software-engineer' })
  })
})

test('registry: only regular .jsonl transcripts are read, and a bad registry never throws', async () => {
  await withDir(async (dir) => {
    const real = join(dir, 'events.jsonl')
    writeFileSync(real, started('child', 'skraft:software-engineer'))
    const link = join(dir, 'link.jsonl')
    symlinkSync(real, link)
    const text = join(dir, 'events.txt')
    writeFileSync(text, started('child', 'skraft:software-engineer'))
    const path = join(dir, 'copilot-subagents.json')
    const registry = createCopilotSubagentRegistry({ path })

    for (const transcriptPath of [link, text, join(dir, 'missing.jsonl'), undefined, 42]) {
      await registry.remember({ transcriptPath })
    }
    await registry.remember()
    assert.equal(await registry.agentNameOf('child'), null)

    writeFileSync(path, '{ corrupted')
    assert.equal(await registry.agentNameOf('child'), null)
    await registry.remember({ transcriptPath: real })
    assert.equal(await registry.agentNameOf('child'), 'skraft:software-engineer')
  })
})

test('registry: the most recent transcript comes first and the list stays bounded', async () => {
  await withDir(async (dir) => {
    const path = join(dir, 'copilot-subagents.json')
    const registry = createCopilotSubagentRegistry({ path })
    for (let index = 0; index < 20; index++) await registry.remember({ transcriptPath: join(dir, `s${index}.jsonl`) })
    await registry.remember({ transcriptPath: join(dir, 's5.jsonl') })

    const { transcripts } = JSON.parse(readFileSync(path, 'utf8'))
    assert.equal(transcripts.length, 16)
    assert.equal(transcripts[0], join(dir, 's5.jsonl'))
    assert.equal(new Set(transcripts).size, transcripts.length)
  })
})
