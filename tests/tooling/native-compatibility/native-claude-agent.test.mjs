import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { defaultPluginRoot } from '../../../scripts/project-plugin-adapters.mjs'
import { projectNativeClaudeAgents } from '../../../scripts/lib/native-claude-agent.mjs'
import { parseYaml } from '../../../eng/lib/yaml-parser.mjs'
import { isModelFamily } from '../../../eng/lib/model-family-policy.mjs'
import { agentAliases, translateAgentLinks } from '../../../scripts/lib/agent-links.mjs'

const native = 'com.anthropic.claude-code/agents'
const copilot = 'com.github.copilot/agents'
const descriptor = ({ name = 'Display Lens', model = 'haiku', tools = ['read/readFile', 'search/codebase'], children, requirement, body = 'Read only.\n' } = {}) =>
  `---\nname: ${name}\ndescription: >-\n  Review changes.\nmodel: ${model}\n# Local comment\nuser-invocable: false\ntools:\n${tools.map((tool) => `  - ${tool}\n`).join('')}${children ? `agents:\n${children.map((child) => `  - ${child}\n`).join('')}` : ''}metadata:\n${requirement ? `  model_requirement: "${requirement}"\n` : ''}  skills: [review]\n---\n${body}`
const header = (text) => parseYaml(text.toString().match(/^---\n([\s\S]*?)\n---/)[1])
const project = (options) => projectNativeClaudeAgents([{ source: `${copilot}/lens.agent.md`, content: Buffer.from(descriptor(options)) }], { exists: () => true })[0].content

for (const model of ['haiku', 'opus', 'gpt-luna', 'kimi']) {
  test(`explicit new-pair helper keeps the model family ${model} with bounded native tools`, () => {
    const data = header(project({ model }))
    assert.equal(data.model, model)
    assert.equal(data.name, 'lens')
    assert.deepEqual(data.tools, ['Read', 'Grep', 'Glob'])
  })
}
for (const options of [{ tools: ['unknown'] }, { model: 'Display Name 1' }, { model: 'vendor-model-5' }, { model: 'inherit' }, { tools: ['execute/sendToTerminal'] }, { tools: ['edit/createDirectory'] }, { children: ['missing'] }]) {
  test(`explicit helper rejects unmapped capability ${JSON.stringify(options)}`, () => assert.throws(() => project(options)))
}
test('explicit helper resolves restricted child capabilities without widening tools', () => {
  const result = projectNativeClaudeAgents([
    { source: `${copilot}/parent.agent.md`, content: Buffer.from(descriptor({ name: 'Parent', tools: ['agent', 'read'], children: ['Child'] })) },
    { source: `${copilot}/child.agent.md`, content: Buffer.from(descriptor({ name: 'Child' })) },
  ], { exists: () => true })
  assert.deepEqual(header(result[0].content).tools, ['Agent(child)', 'Read'])
})
test('Markdown destination translation preserves titles, references, code and non-link prose', () => {
  const body = '[Child](child.md?q=1#gate "Title")\n[ref]: <child.md#gate> "Child"\n' +
    '`[example](missing.md)`\n````md\n[example](missing.md)\n```\n````\n' +
    '[url](https://example.org/a.md) [anchor](#gate) [template](./adr-{id}.md)\nchild.md\n'
  const translated = translateAgentLinks(body, { source: `${native}/lens.md`, target: `${copilot}/lens.agent.md`, side: 'copilot', aliases: agentAliases(['lens', 'child']), exists: () => false })
  assert.equal(translated, body.replace('(child.md?', '(child.agent.md?').replace('<child.md#', '<child.agent.md#'))
  for (const destination of ['../../../../escape.md', '/etc/passwd', 'missing.md']) {
    assert.throws(() => translateAgentLinks(`[bad](${destination})`, { source: `${native}/lens.md`, target: `${copilot}/lens.agent.md`, side: 'copilot', aliases: agentAliases(['lens']), exists: () => false }), /escape|Unresolved/)
  }
})
test('actual native tree keeps native IDs, bounded tools, family models and one public flag', () => {
  const files = readdirSync(join(defaultPluginRoot, native)).sort()
  const publicIds = []
  for (const file of files) {
    assert.match(file, /^[\w-]+\.md$/)
    const data = header(readFileSync(join(defaultPluginRoot, native, file)))
    assert.equal(data.name, file.replace(/\.md$/, ''))
    if (data.name === 'skraft-orchestrator') assert.equal(data.model, 'inherit')
    else assert.ok(isModelFamily(data.model), `${file}: model '${data.model}' is not a family`)
    if (data['user-invocable']) publicIds.push(data.name)
    assert.equal(data.tools.includes('*'), false)
    assert.equal(data.tools.includes('mcp__*'), false)
    if (file.endsWith('-lens.md') || file === 'finding-refuter.md') assert.deepEqual(data.tools, ['Read', 'Grep', 'Glob'])
  }
  assert.deepEqual(publicIds, ['skraft-orchestrator'])
})
