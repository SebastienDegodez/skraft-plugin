import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, API, nominal, scripted } from '../support/pipeline-host.mjs'
import { InMemoryAgentCatalog } from '../support/in-memory-host.mjs'

const SKILL_TEXT = '# skill\n'

/** A catalog where the agents declare `declared`, and every skill named in `shipped` exists in the plugin. */
const catalogOf = (declared, shipped) => new InMemoryAgentCatalog({
  skills: declared,
  skillFiles: Object.fromEntries(shipped.map((name) => [name, SKILL_TEXT])),
})

/** The `- Skills` section of a brief: the lines between its title and the next section. @param {string} prompt */
const skillLines = (prompt) => {
  const lines = prompt.split('\n')
  const start = lines.indexOf('- Skills (read each before you start):')
  if (start < 0) return []
  const end = lines.findIndex((line, index) => index > start && !line.startsWith('- /'))
  return lines.slice(start + 1, end < 0 ? lines.length : end)
}

const WEB = Object.freeze({
  name: 'web', root: '../web', stack: 'react',
  paths: { src: ['src'], tests: ['tests'] },
  commands: { test: 'npm test' },
})

test('each agent reads the skills it declares, at their absolute paths, in their order and each once, before anything else of its brief', async () => {
  const catalog = catalogOf(
    { 'solution-researcher': ['github-search', 'research-notes'], 'software-engineer': ['outside-in-tdd', 'mocking-inprocess-dotnet', 'craft-discipline'] },
    ['github-search', 'research-notes', 'outside-in-tdd', 'craft-discipline', 'mocking-inprocess-dotnet'],
  )
  const host = scripted({ catalog }, nominal)

  await host.start({ story: { issue: 42, title: 'Pay by card' } })

  const [research, , , deliver] = host.agentRunner.dispatches.map((dispatch) => dispatch.prompt)
  assert.ok(research.includes([
    '- Attempt: 1 of 3',
    '- Skills (read each before you start):',
    '- /plugin/skills/github-search/SKILL.md',
    '- /plugin/skills/research-notes/SKILL.md',
    '- Fill each output in place; keep the path, create no other copy:',
  ].join('\n')), research)
  assert.deepEqual(skillLines(deliver), [
    '- /plugin/skills/outside-in-tdd/SKILL.md',
    '- /plugin/skills/mocking-inprocess-dotnet/SKILL.md',
    '- /plugin/skills/craft-discipline/SKILL.md',
  ])
})

test('an agent that writes component code reads the mocking skill of each component, and the contract testing skills only for a component that turns them on, each once', async () => {
  const catalog = catalogOf(
    { 'software-engineer': ['outside-in-tdd'] },
    ['outside-in-tdd', 'mocking-inprocess-dotnet', 'mocking-microcks-dotnet', 'mocking-microcks-typescript', 'mocking-inprocess-typescript', 'contract-testing', 'contract-testing-dotnet'],
  )
  const ADMIN = { ...WEB, name: 'admin', root: '../admin', stack: 'javascript', mocking: { strategy: 'inprocess' } }
  const PAY = { ...API, name: 'pay', root: '../pay', contractTesting: true }
  const host = scripted({ catalog, components: [{ ...API, contractTesting: true }, WEB, ADMIN, PAY] }, nominal)

  await host.start()

  const [research, design, distill, deliver] = host.agentRunner.dispatches.map((dispatch) => dispatch.prompt)
  const componentSkills = [
    '- /plugin/skills/mocking-inprocess-dotnet/SKILL.md',
    '- /plugin/skills/contract-testing/SKILL.md',
    '- /plugin/skills/contract-testing-dotnet/SKILL.md',
    '- /plugin/skills/mocking-microcks-typescript/SKILL.md',
    '- /plugin/skills/mocking-inprocess-typescript/SKILL.md',
  ]
  assert.deepEqual(skillLines(deliver), ['- /plugin/skills/outside-in-tdd/SKILL.md', ...componentSkills])
  assert.deepEqual(skillLines(distill), componentSkills)
  assert.deepEqual(skillLines(research), [])
  assert.deepEqual(skillLines(design), [])
  assert.ok(deliver.includes([
    '- Components:',
    '- api: . (dotnet), mocking: inprocess, contract testing: on, tests: dotnet test',
    '- web: ../web (react), mocking: microcks, contract testing: off, tests: npm test',
    '- admin: ../admin (javascript), mocking: inprocess, contract testing: off, tests: npm test',
    '- pay: ../pay (dotnet), mocking: inprocess, contract testing: on, tests: dotnet test',
  ].join('\n')), deliver)
})

test('a skill the plugin does not ship for a stack is left out of the brief, the component line still telling its mocking', async () => {
  const catalog = catalogOf({}, ['mocking-microcks-dotnet', 'contract-testing'])
  const java = { name: 'orders', root: 'orders', stack: 'java', paths: { src: ['src/main'], tests: ['src/test'] }, commands: { test: 'mvn test' }, contractTesting: true }
  const host = scripted({ catalog, components: [java] }, (it) => [
    agent()(it),
    agent({ work: ({ git }) => git.commit('docs(checkout): ADR for the order', ['docs/adr/adr-001-order.md']) })(it),
    agent({ work: ({ git }) => git.commit('test(checkout): acceptance of the order', ['orders/src/test/OrderAcceptanceTest.java']) })(it),
    agent({ work: ({ git }) => git.commit('test(checkout): an order needs a line', ['orders/src/test/OrderTest.java']) })(it),
  ])

  await host.start()

  const deliver = host.agentRunner.dispatches[3].prompt
  assert.deepEqual(skillLines(deliver), ['- /plugin/skills/contract-testing/SKILL.md'])
  assert.ok(deliver.includes('- orders: orders (java), mocking: microcks, contract testing: on, tests: mvn test\n'), deliver)
})
