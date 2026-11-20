import { deepStrictEqual, match, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'

import { categoryOf, renderTurns, turnSummary, turnsOf } from '../../eng/lib/agent-turns.mjs'

const at = (second) => new Date(Date.UTC(2026, 10, 20, 10, 0, second)).toISOString()
const turn = (start, end, calls, tokens = 1000) => [
  { type: 'turn_start', timestamp: at(start), data: { turnId: String(start) } },
  { type: 'token_usage', timestamp: at(start), data: { inputTokens: tokens, outputTokens: 50 } },
  ...calls.flatMap(([id, toolName, args, from, to, output = 'ok']) => [
    { type: 'tool_call', timestamp: at(from), data: { toolName, toolCallId: id, arguments: args } },
    { type: 'tool_result', timestamp: at(to), data: { toolName, toolCallId: id, result: { content: output } } },
  ]),
  { type: 'turn_end', timestamp: at(end), data: { turnId: String(start) } },
]

describe('agent turns', () => {
  it('sorts a call into the work it does', () => {
    deepStrictEqual(
      [
        categoryOf('view'),
        categoryOf('edit'),
        categoryOf('skill'),
        categoryOf('bash', 'dotnet test X.slnx --filter Foo'),
        categoryOf('bash', 'dotnet test X.slnx && git add a && git commit -m "feat: x"'),
        categoryOf('bash', 'dotnet build X.slnx'),
        categoryOf('bash', 'git status'),
        categoryOf('bash', 'dotnet stryker'),
        categoryOf('bash', 'cat src/A.cs'),
        categoryOf('bash', 'mkdir -p x'),
      ],
      ['read', 'edit', 'skill', 'test', 'test+commit', 'build', 'git', 'mutation', 'read', 'shell'],
    )
  })

  it('groups the calls of each turn with their time, output and tokens', () => {
    const turns = turnsOf([
      ...turn(0, 3, [['a', 'view', { path: 'src/A.cs' }, 1, 2, 'x'.repeat(30)]], 500),
      ...turn(4, 20, [['b', 'bash', { command: 'dotnet test X.slnx' }, 5, 19, 'Passed!']], 900),
    ])

    deepStrictEqual(turns.map(({ index, durationMs, inputTokens, calls }) => [index, durationMs, inputTokens, calls.map(({ category, target, durationMs: ms, outputChars }) => [category, target, ms, outputChars])]), [
      [1, 3000, 500, [['read', 'src/A.cs', 1000, 30]]],
      [2, 16000, 900, [['test', 'dotnet test X.slnx', 14000, 7]]],
    ])
  })

  it('counts the turns a batched read or a lone test run spends', () => {
    const summary = turnSummary(turnsOf([
      ...turn(0, 2, [['a', 'view', { path: 'A' }, 0, 1]]),
      ...turn(3, 5, [['b', 'view', { path: 'B' }, 3, 4], ['c', 'view', { path: 'C' }, 3, 4]]),
      ...turn(6, 9, [['d', 'bash', { command: 'dotnet test X' }, 6, 8]]),
      ...turn(10, 11, []),
    ]))

    deepStrictEqual([summary.turns, summary.singleRead, summary.singleTest, summary.parallel, summary.noTool], [4, 1, 1, 1, 1])
    deepStrictEqual(summary.categories.read, { calls: 3, durationMs: 3000, outputChars: 6 })
  })

  it('renders the summary and one line per turn', () => {
    const markdown = renderTurns(turnsOf(turn(0, 3, [['a', 'edit', { path: 'src/A.cs' }, 1, 2]])), { title: 'Essai 1' })

    match(markdown, /^## Essai 1\n\n1 tours — sans outil : 0 · une seule lecture : 0/)
    match(markdown, /\| 1 \| 3\.0 s \| 1000 \| edit: src\/A\.cs \(1\.0 s\) \|/)
    strictEqual(markdown.includes('| edit | 1 | 1.0 s | 2 |'), true)
  })
})

it('a heredoc or redirect into a file is an edit, a chained test makes it edit+test', () => {
  strictEqual(categoryOf('bash', "cat > src/A.cs <<'EOF'\nclass A {}\nEOF"), 'edit')
  strictEqual(categoryOf('bash', "cat > src/A.cs <<'EOF'\nclass A {}\nEOF\ndotnet test --filter X"), 'edit+test')
  strictEqual(categoryOf('bash', 'printf "x" > a.txt'), 'edit')
  strictEqual(categoryOf('bash', 'cat src/A.cs'), 'read')
  strictEqual(categoryOf('bash', 'cat src/A.cs | grep x'), 'read')
})
