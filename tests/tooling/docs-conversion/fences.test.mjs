import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyFence } from '../../../eng/docs/convert-jekyll.mjs'

const classify = (info, lines, context = {}) => classifyFence({ info, lines, context: { paragraph: '', heading: '', ...context } })

test('a block of known commands becomes a console block with a $ prompt on each command', () => {
  assert.deepEqual(classify('text', ['git add .', 'git commit -m "Start the shop"', 'copilot']), {
    kind: 'commands',
    info: 'console',
    lines: ['$ git add .', '$ git commit -m "Start the shop"', '$ copilot'],
  })
})

test('a shell fence (none, bash, sh) of commands also becomes console; its other meta stays', () => {
  assert.equal(classify('', ['node "<plugin folder>/engine/drivers/cli/skraft.mjs" <command>']).info, 'console')
  assert.equal(classify('bash', ['npm install -g @microsoft/vally-cli@0.12.0', 'vally lint --strict']).info, 'console')
  assert.equal(classify('sh title="Install"', ['./eng/run-vally-evals.sh']).info, 'console title="Install"')
})

test('a trailing backslash continues a command: the continuation gets no prompt', () => {
  assert.deepEqual(classify('text', ['npx stryker run \\', '  --incremental']).lines, ['$ npx stryker run \\', '  --incremental'])
})

test('a command followed by its output prompts only the command', () => {
  assert.deepEqual(classify('text', ['skraft gate --all', 'pass  web/test', 'skraft checkout: gates passed']), {
    kind: 'command-output',
    info: 'console',
    lines: ['$ skraft gate --all', 'pass  web/test', 'skraft checkout: gates passed'],
  })
})

test('skraft followed by a slug, not a command, is CLI output: console without a prompt', () => {
  assert.deepEqual(classify('text', ['skraft checkout: done — PUBLISH closed']), {
    kind: 'cli-output',
    info: 'console',
    lines: ['skraft checkout: done — PUBLISH closed'],
  })
  assert.equal(classify('text', ['skraft checkout started — progress in the Skraft pane.']).kind, 'cli-output')
})

test('a program name inside output is no command: an indented usage line, a word ending with a colon', () => {
  assert.deepEqual(classify('', ['usage: skraft --version', '       skraft install [--no-path]']).kind, 'unchanged')
  assert.deepEqual(classify('', ['skraft journal adopt: sign the journal on from here? [y/N]']), {
    kind: 'cli-output',
    info: 'console',
    lines: ['skraft journal adopt: sign the journal on from here? [y/N]'],
  })
})

test('an output format with placeholders, a file, a log or an unknown program stays as it is', () => {
  for (const [info, lines] of [
    ['', ['skraft <slug>: <status>', '  <PHASE>  <state>']],
    ['text', ['pass  web/build', 'pass  web/lint']],
    ['text', ['$ npm test', 'cwd: ../payment-web']],
    ['text', ["find ~/.claude/plugins -path '*engine/drivers/cli/skraft.mjs'"]],
    ['text', ['.copilot-tracking/skraft-plans/<slug>/gates/<component>/<gate>-<n>.log']],
    ['json', ['{ "a": 1 }']],
    ['console', ['$ skraft status']],
    ['bash', ['if [ -f x ]; then', '  echo y', 'fi']],
  ]) assert.deepEqual(classify(info, lines), { kind: 'unchanged', info, lines })
})

test('host slash commands take a > prompt and the host named just above as title', () => {
  assert.deepEqual(classify('text', ['/plugin marketplace add SebastienDegodez/skraft-plugin', '/plugin install skraft'], {
    paragraph: 'In the Claude Code conversation, type:',
  }), {
    kind: 'host',
    info: 'console title="Claude Code"',
    lines: ['> /plugin marketplace add SebastienDegodez/skraft-plugin', '> /plugin install skraft'],
  })
  assert.equal(classify('text', ['/skraft checkout'], { paragraph: 'Type:', heading: 'GitHub Copilot CLI' }).info, 'console title="GitHub Copilot CLI"')
})

test('host slash commands with no host or two hosts named are ambiguous and stay as they are', () => {
  assert.deepEqual(classify('text', ['/skraft checkout #42 Pay by card'], { paragraph: 'Type the command:' }), {
    kind: 'ambiguous',
    info: 'text',
    lines: ['/skraft checkout #42 Pay by card'],
    reason: 'host slash commands, but no single host named above the block',
  })
  assert.equal(classify('text', ['/skraft x'], { paragraph: 'Under Claude Code or VS Code, type:' }).kind, 'ambiguous')
})

test('commands that do not start the block are ambiguous', () => {
  assert.deepEqual(classify('text', ['# install the tools', 'npm ci']), {
    kind: 'ambiguous',
    info: 'text',
    lines: ['# install the tools', 'npm ci'],
    reason: 'commands mixed with other lines, the first line is not a command',
  })
})
