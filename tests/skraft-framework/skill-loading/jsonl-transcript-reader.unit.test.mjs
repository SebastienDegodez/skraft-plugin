import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir, writeFile, symlink, realpath, readdir } from 'node:fs/promises'
import { readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJsonlTranscriptReader } from '../../../plugins/skraft-framework/src/adapters/infrastructure/jsonl-transcript-reader.mjs'

// Canonical temp base: the reader refuses any symlinked ancestor, so the base
// itself must be a realpath.
const withTemp = async (fn) => {
  const dir = await mkdtemp(join(await realpath(tmpdir()), 'skraft-transcript-'))
  try { return await fn(dir) } finally { await rm(dir, { recursive: true, force: true }) }
}

const isUnavailable = (error) => {
  assert.ok(error instanceof Error, `expected an Error, got ${error}`)
  assert.equal(error.message, 'TRANSCRIPT_UNAVAILABLE')
  return true
}

const read = (options) => createJsonlTranscriptReader(options).read()

const openFds = () => {
  try { return readdirSync('/proc/self/fd').length } catch { return undefined }
}

test('jsonl-transcript-reader: a non-empty inline transcript is serialized as JSON', async () => {
  const transcript = [{ role: 'user', content: 'hi' }]
  assert.equal(await read({ transcript }), JSON.stringify(transcript))
})

test('jsonl-transcript-reader: an empty inline transcript falls back to the native path', () => withTemp(async (dir) => {
  const path = join(dir, 'agent.jsonl')
  await writeFile(path, '{"a":1}\n')
  assert.equal(await read({ transcript: [], agentTranscriptPath: path }), '{"a":1}\n')
  await assert.rejects(read({ transcript: [] }), isUnavailable)
}))

test('jsonl-transcript-reader: reads the agent transcript file verbatim', () => withTemp(async (dir) => {
  const path = join(dir, 'agent.jsonl')
  const content = '{"type":"assistant","text":"é"}\n{"type":"user"}\n'
  await writeFile(path, content)
  assert.equal(await read({ agentTranscriptPath: path }), content)
  assert.equal(await read({ agent_transcript_path: path }), content)
}))

test('jsonl-transcript-reader: rejects invalid paths as unavailable', () => withTemp(async (dir) => {
  const wrongExt = join(dir, 'agent.json')
  await writeFile(wrongExt, '{"a":1}\n')
  await assert.rejects(read({}), isUnavailable)
  await assert.rejects(read({ agentTranscriptPath: 42 }), isUnavailable)
  await assert.rejects(read({ agentTranscriptPath: { toString: () => wrongExt } }), isUnavailable)
  await assert.rejects(read({ agentTranscriptPath: '' }), isUnavailable)
  await assert.rejects(read({ agentTranscriptPath: wrongExt }), isUnavailable)
}))

test('jsonl-transcript-reader: rejects a non-integer or non-positive byte budget', () => withTemp(async (dir) => {
  const path = join(dir, 'agent.jsonl')
  await writeFile(path, 'x')
  for (const maxBytes of [1.5, Number.NaN, Infinity, '8', 2 ** 60, 0, -1]) {
    await assert.rejects(read({ agentTranscriptPath: path, maxBytes }), isUnavailable, String(maxBytes))
  }
}))

test('jsonl-transcript-reader: a symlinked transcript file is unavailable', () => withTemp(async (dir) => {
  const target = join(dir, 'real.jsonl')
  await writeFile(target, '{"a":1}\n')
  const link = join(dir, 'link.jsonl')
  await symlink(target, link)
  await assert.rejects(read({ agentTranscriptPath: link }), isUnavailable)
}))

test('jsonl-transcript-reader: a symlinked ancestor directory is unavailable', () => withTemp(async (dir) => {
  await mkdir(join(dir, 'real', 'nested'), { recursive: true })
  await writeFile(join(dir, 'real', 'nested', 'agent.jsonl'), '{"a":1}\n')
  await symlink(join(dir, 'real'), join(dir, 'alias'))
  await assert.rejects(read({ agentTranscriptPath: join(dir, 'alias', 'nested', 'agent.jsonl') }), isUnavailable)
  // The same file through its canonical path is readable.
  assert.equal(await read({ agentTranscriptPath: join(dir, 'real', 'nested', 'agent.jsonl') }), '{"a":1}\n')
}))

test('jsonl-transcript-reader: a directory named *.jsonl is unavailable', () => withTemp(async (dir) => {
  await mkdir(join(dir, 'folder.jsonl'))
  await assert.rejects(read({ agentTranscriptPath: join(dir, 'folder.jsonl') }), isUnavailable)
}))

test('jsonl-transcript-reader: a missing transcript propagates ENOENT', () => withTemp(async (dir) => {
  await assert.rejects(read({ agentTranscriptPath: join(dir, 'missing.jsonl') }), { code: 'ENOENT' })
}))

test('jsonl-transcript-reader: an empty transcript file is unavailable', () => withTemp(async (dir) => {
  const path = join(dir, 'empty.jsonl')
  await writeFile(path, '')
  await assert.rejects(read({ agentTranscriptPath: path }), isUnavailable)
}))

test('jsonl-transcript-reader: a file of exactly maxBytes is read in full', () => withTemp(async (dir) => {
  const path = join(dir, 'agent.jsonl')
  await writeFile(path, 'abcde')
  assert.equal(await read({ agentTranscriptPath: path, maxBytes: 5 }), 'abcde')
  await writeFile(path, 'z')
  assert.equal(await read({ agentTranscriptPath: path, maxBytes: 1 }), 'z')
}))

test('jsonl-transcript-reader: a file larger than maxBytes is unavailable', () => withTemp(async (dir) => {
  const path = join(dir, 'agent.jsonl')
  await writeFile(path, 'abcdef')
  await assert.rejects(read({ agentTranscriptPath: path, maxBytes: 5 }), isUnavailable)
}))

test('jsonl-transcript-reader: a file larger than one 64 KiB chunk is read in full', () => withTemp(async (dir) => {
  const path = join(dir, 'big.jsonl')
  const line = `${JSON.stringify({ pad: 'x'.repeat(1000) })}\n`
  const content = line.repeat(150)
  await writeFile(path, content)
  const result = await read({ agentTranscriptPath: path })
  assert.equal(result.length, content.length)
  assert.equal(result, content)
  assert.equal(await read({ agentTranscriptPath: path, maxBytes: Buffer.byteLength(content) }), content)
}))

test('jsonl-transcript-reader: the default budget accepts files below 8 MiB', () => withTemp(async (dir) => {
  const path = join(dir, 'agent.jsonl')
  await writeFile(path, 'ok\n')
  assert.equal(await read({ agentTranscriptPath: path }), 'ok\n')
  assert.deepEqual(await readdir(dir), ['agent.jsonl'])
}))

test('jsonl-transcript-reader: closes the file handle after success and failure', () => withTemp(async (dir) => {
  const ok = join(dir, 'ok.jsonl')
  const big = join(dir, 'big.jsonl')
  const empty = join(dir, 'empty.jsonl')
  await writeFile(ok, 'ok')
  await writeFile(big, 'too big')
  await writeFile(empty, '')
  const before = openFds()
  for (let i = 0; i < 3; i += 1) {
    await read({ agentTranscriptPath: ok })
    await assert.rejects(read({ agentTranscriptPath: big, maxBytes: 2 }), isUnavailable)
    await assert.rejects(read({ agentTranscriptPath: empty }), isUnavailable)
  }
  if (before !== undefined) assert.equal(openFds(), before)
}))
