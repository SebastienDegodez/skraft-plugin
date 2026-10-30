// The az route posts a refinement comment through `az devops invoke --in-file`: the request body
// must carry the prepared Markdown byte for byte, marker line and trailing newline included.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { main } from '../../../plugins/skraft-backlog/skills/azure-boards-work-items/scripts/comment-request.mjs'

const script = fileURLToPath(new URL('../../../plugins/skraft-backlog/skills/azure-boards-work-items/scripts/comment-request.mjs', import.meta.url))

const comment = [
  '## 🛠️ Proposition de refinement — à retravailler',
  '',
  '- **Étant donné** Léa, 22 ans, « permis suspendu »',
  '```json',
  '{ "path": "C:\\\\work\\\\a.json", "tab": "\t" }',
  '```',
  '<sub>skraft-refine v=2.0.0 hash=0123456789abcdef</sub>',
  '',
].join('\n')

const workspace = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'skraft-comment-request-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(join(dir, 'comment.md'), comment, 'utf8')
  return dir
}

test('the request body carries the prepared comment unchanged', (t) => {
  const dir = workspace(t)
  const result = spawnSync(process.execPath, [script, '--in', join(dir, 'comment.md'), '--out', join(dir, 'comment.json')], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  const body = JSON.parse(readFileSync(join(dir, 'comment.json'), 'utf8'))
  assert.deepEqual(Object.keys(body), ['text'])
  assert.equal(body.text, comment)
})

test('an existing request body is never overwritten', (t) => {
  const dir = workspace(t)
  writeFileSync(join(dir, 'comment.json'), '{"text":"older"}', 'utf8')
  const lines = []
  const status = main(['--in', join(dir, 'comment.md'), '--out', join(dir, 'comment.json')], { log: (line) => lines.push(line) })
  assert.equal(status, 1)
  assert.equal(JSON.parse(lines[0]).error, 'output_exists')
  assert.equal(readFileSync(join(dir, 'comment.json'), 'utf8'), '{"text":"older"}')
})

test('a missing comment file writes nothing', (t) => {
  const dir = workspace(t)
  const lines = []
  const status = main(['--in', join(dir, 'absent.md'), '--out', join(dir, 'comment.json')], { log: (line) => lines.push(line) })
  assert.equal(status, 1)
  assert.equal(JSON.parse(lines[0]).error, 'unreadable_input')
  assert.throws(() => readFileSync(join(dir, 'comment.json')), { code: 'ENOENT' })
})

test('an unknown or missing argument is refused', () => {
  for (const argv of [[], ['--in', 'a.md'], ['--in', 'a.md', '--out'], ['--body', 'a.md', '--out', 'b.json']]) {
    const lines = []
    assert.equal(main(argv, { log: (line) => lines.push(line) }), 2, argv.join(' '))
    assert.match(lines[0], /^usage: /)
  }
})
