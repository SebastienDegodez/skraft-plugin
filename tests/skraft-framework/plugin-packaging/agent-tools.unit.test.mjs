import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateAgentTools } from '../../../scripts/lib/agent-tools.mjs'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const descriptor = (field, newline = '\n') => ['---', 'name: probe', ...field.split('\n'), 'metadata:', '  tools: [not-a-top-level-tool]', '---', 'tools: [body-is-not-frontmatter]', ''].join(newline)

for (const [client, names] of [
  ['local', ['read/readFile', 'edit/editFiles', 'execute/runInTerminal']],
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
      assert.deepEqual(validateAgentTools(descriptor(field, newline), { client }), {
        tools: names, externalTools: [], compatibilityWarnings: [],
      })
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
  ['tools: [Read]', 'local', /unsupported local/],
  ['tools: [search/list_directory]', 'local', /unsupported local/],
  ['tools: [mcp__github__*]', 'copilot', /unsupported copilot/],
  ['tools: [github/*]', 'claude', /unsupported claude/],
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

for (const [client, references] of [
  ['local', ['graphify/*', 'github/*', 'ado/*', 'gitlab/*']],
  ['copilot', ['graphify/*', 'github/*', 'ado/*', 'gitlab/*']],
  ['claude', ['mcp__graphify__*', 'mcp__github__*', 'mcp__ado__*', 'mcp__gitlab__*']],
]) {
  test(`tools contract reports ${client} MCP dependencies without claiming runtime availability`, () => {
    assert.deepEqual(validateAgentTools(descriptor(`tools: [${references.join(', ')}]`), { client }), {
      tools: references, externalTools: references, compatibilityWarnings: [],
    })
  })
}

test('versioned Claude contract reports TaskOutput removal instead of silently claiming current support', () => {
  const result = validateAgentTools(descriptor('tools: [Read, TaskOutput]'), { client: 'claude' })
  assert.deepEqual(result.tools, ['Read', 'TaskOutput'])
  assert.equal(result.compatibilityWarnings.length, 1)
  assert.match(result.compatibilityWarnings[0], /removed.*2\.1\.277.*Read/)
})

for (const plugin of ['skraft-framework', 'skraft-backlog']) {
  for (const [client, tree] of [
    ['local', 'com.github.copilot'],
    ['copilot', 'com.github.copilot'],
    ['claude', 'com.anthropic.claude-code'],
  ]) {
    test(`shipped tools: ${plugin} ${client} declarations preserve tools across block and inline forms`, (t) => {
      const directory = join(repoRoot, 'plugins', plugin, tree, 'agents')
      const files = readdirSync(directory).filter((file) => file.endsWith('.md'))
      assert.ok(files.length > 0, `${directory}: no descriptors checked`)
      const agentIds = files.map((file) => file.replace(/(?:\.agent)?\.md$/, ''))
      for (const file of files) {
        const label = `${plugin}/${tree}/agents/${file}`
        const content = readFileSync(join(directory, file), 'utf8')
        const result = validateAgentTools(content, { client, agentIds })
        const inline = content.replace(/^tools:[^\r\n]*(?:\r?\n[ \t]+-[^\r\n]*)*/m, `tools: ${JSON.stringify(result.tools)}`)
        assert.deepEqual(validateAgentTools(inline, { client, agentIds }), result, label)
        if (result.externalTools.length) t.diagnostic(`${label}: MCP inventory required for ${result.externalTools.join(', ')}`)
        for (const warning of result.compatibilityWarnings) t.diagnostic(`${label}: ${warning}`)
      }
    })
  }
}
