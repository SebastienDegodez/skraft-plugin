import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateAgentTools } from '../../../scripts/lib/agent-tools.mjs'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const descriptor = (field, newline = '\n') => ['---', 'name: probe', ...field.split('\n'), 'metadata:', '  tools: [not-a-top-level-tool]', '---', 'tools: [body-is-not-frontmatter]', ''].join(newline)

for (const [client, names] of [
  ['copilot', ['read/readFile', 'edit/editFiles', 'execute/runInTerminal']],
  ['claude', ['Read', 'Edit', 'Bash']],
]) {
  test(`tools contract: ${client} preserves the same boundary across block, flow and scalar forms`, () => {
    const fields = [
      `tools:\n${names.map((name) => `  - ${name}`).join('\n')}`,
      `tools: [${names.map((name) => `'${name}'`).join(', ')}]`,
      `tools: "${names.join(', ')}"`,
    ]
    for (const newline of ['\n', '\r\n']) for (const field of fields) {
      assert.deepEqual(validateAgentTools(descriptor(field, newline), { client }), { tools: names, externalTools: [] })
    }
  })
}

for (const [field, client, error] of [
  ['model: inherit', 'copilot', /exactly one/],
  ['tools: [read]\ntools: [edit]', 'copilot', /exactly one/],
  ['tools:\n[read/readFile, edit/editFiles]', 'copilot', /expected tool names/],
  ['tools:\n  read: true', 'copilot', /expected tool names/],
  ['tools: [read/readFile, false]', 'copilot', /expected tool names/],
  ['tools: [read/readFile, read/readFile]', 'copilot', /duplicate reference/],
  ["tools: ['']", 'copilot', /expected tool names/],
  ['tools: [read/read_file]', 'copilot', /unsupported copilot/],
  ['tools: [readFile]', 'copilot', /unsupported copilot/],
  ['tools: [copilot_readFile]', 'copilot', /unsupported copilot/],
  ['tools: [Read]', 'copilot', /unsupported copilot/],
  ["tools: ['*']", 'copilot', /unsupported copilot/],
  ['tools: [unknown/*]', 'copilot', /unsupported copilot/],
  ['tools: [read/readFile]', 'claude', /unsupported claude/],
  ['tools: [read]', 'claude', /unsupported claude/],
  ['tools:\n  - Agent(missing)', 'claude', /delegated agent/],
  ['tools:\n  - Agent(worker, worker)', 'claude', /delegated agent/],
  ['tools: Agent(worker', 'claude', /unmatched opening/],
]) {
  test(`tools contract rejects ${client} ${JSON.stringify(field)}`, () => {
    assert.throws(() => validateAgentTools(descriptor(field), { client, agentIds: ['worker'] }), error)
  })
}

test('tools contract keeps scoped Claude delegation intact in scalar and list forms', () => {
  for (const field of ['tools: Read, Agent(researcher, reviewer)', 'tools:\n  - Read\n  - Agent(researcher, reviewer)']) {
    assert.deepEqual(
      validateAgentTools(descriptor(field), { client: 'claude', agentIds: ['researcher', 'reviewer'] }).tools,
      ['Read', 'Agent(researcher, reviewer)'],
    )
  }
})

test('tools contract reports MCP wildcard as external, not as a verified builtin', () => {
  assert.deepEqual(validateAgentTools(descriptor('tools: [read, graphify/*]'), { client: 'copilot' }), {
    tools: ['read', 'graphify/*'], externalTools: ['graphify/*'],
  })
})

for (const plugin of ['skraft-framework', 'skraft-backlog']) {
  for (const [client, tree] of [
    ['copilot', 'com.github.copilot'],
    ['claude', 'com.anthropic.claude-code'],
  ]) {
    test(`shipped tools: every ${plugin} ${client} descriptor declares supported references`, () => {
      const directory = join(repoRoot, 'plugins', plugin, tree, 'agents')
      const files = readdirSync(directory).filter((file) => file.endsWith('.md'))
      assert.ok(files.length > 0, `${directory}: no descriptors checked`)
      const agentIds = files.map((file) => file.replace(/(?:\.agent)?\.md$/, ''))
      for (const file of files) {
        assert.doesNotThrow(
          () => validateAgentTools(readFileSync(join(directory, file), 'utf8'), { client, agentIds }),
          `${plugin}/${tree}/agents/${file}`,
        )
      }
    })
  }
}
