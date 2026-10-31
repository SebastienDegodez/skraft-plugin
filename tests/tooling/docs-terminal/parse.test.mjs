import { test } from 'node:test'
import assert from 'node:assert/strict'
import { commandsOf, languageOf, parseConsole, statusOf, titleOf } from '../../../docs/website/src/components/Terminal/parse.mjs'

// A ```console fence: `$ `, `PS> ` and `> ` start commands, a trailing `\` continues one, every
// other line is output. The copy button copies the commands only.

test('a POSIX session splits into commands and their output', () => {
  const rows = parseConsole('$ skraft status\nskraft status: waiting\n$ git status\nnothing to commit\n')
  assert.deepEqual(rows, [
    { kind: 'command', prompt: '$', text: 'skraft status' },
    { kind: 'output', prompt: '', text: 'skraft status: waiting' },
    { kind: 'command', prompt: '$', text: 'git status' },
    { kind: 'output', prompt: '', text: 'nothing to commit' },
  ])
  assert.equal(commandsOf(rows), 'skraft status\ngit status')
})

test('a continued command is copied as one line, its continuation keeps the command language', () => {
  const rows = parseConsole('$ npm install \\\n    --prefix web \\\n    tap\nadded 1 package')
  assert.deepEqual(rows.map((row) => row.kind), ['command', 'continuation', 'continuation', 'output'])
  assert.equal(languageOf(rows[1]), 'bash')
  assert.equal(commandsOf(rows), 'npm install --prefix web tap')
})

test('a backslash on an output line does not continue anything', () => {
  const rows = parseConsole('C:\\work\\\n$ dir')
  assert.deepEqual(rows.map((row) => row.kind), ['output', 'command'])
})

test('a PowerShell command is highlighted as PowerShell', () => {
  const rows = parseConsole('PS> node "C:\\skraft\\skraft.mjs" doctor\nok node')
  assert.deepEqual(rows[0], { kind: 'command', prompt: 'PS>', text: 'node "C:\\skraft\\skraft.mjs" doctor' })
  assert.equal(languageOf(rows[0]), 'powershell')
  assert.equal(commandsOf(rows), 'node "C:\\skraft\\skraft.mjs" doctor')
})

test('a host prompt command is plain text and copied without its prompt', () => {
  const rows = parseConsole('> /skraft pay-by-card\nskraft: RESEARCH started')
  assert.deepEqual(rows[0], { kind: 'command', prompt: '>', text: '/skraft pay-by-card' })
  assert.equal(languageOf(rows[0]), undefined)
  assert.equal(commandsOf(rows), '/skraft pay-by-card')
})

test('an output-only block has nothing to copy', () => {
  const rows = parseConsole('skraft checkout: waiting\nskraft checkout: done')
  assert.ok(rows.every((row) => row.kind === 'output'))
  assert.equal(commandsOf(rows), '')
})

test('status words that start an output line are recognised as in the SVG transcripts', () => {
  assert.deepEqual(statusOf('ok   tests (12 s)'), { word: 'ok', status: 'ok' })
  assert.deepEqual(statusOf('pass mutation 100 %'), { word: 'pass', status: 'ok' })
  assert.deepEqual(statusOf('WARN coverage 79 %'), { word: 'WARN', status: 'warn' })
  assert.deepEqual(statusOf('FAIL lint'), { word: 'FAIL', status: 'fail' })
  assert.deepEqual(statusOf('fail build'), { word: 'fail', status: 'fail' })
  assert.equal(statusOf('okay then'), undefined)
  assert.equal(statusOf('the gate is ok '), undefined)
})

test('the window title comes from the fence meta, in either quote style', () => {
  assert.equal(titleOf('title="Claude Code"'), 'Claude Code')
  assert.equal(titleOf("showLineNumbers title='checkout'"), 'checkout')
  assert.equal(titleOf(''), undefined)
  assert.equal(titleOf(undefined), undefined)
})
