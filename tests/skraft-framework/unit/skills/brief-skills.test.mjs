import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, API, nominal, REFS_42, scripted } from '../support/pipeline-host.mjs'
import { InMemoryAgentCatalog } from '../support/in-memory-host.mjs'

const SKILL_TEXT = '# skill\n'

/** A catalog where the agents declare `declared`, and every skill named in `shipped` exists in the plugin. */
const catalogOf = (declared, shipped) => new InMemoryAgentCatalog({
  skills: declared,
  skillFiles: Object.fromEntries(shipped.map((name) => [name, SKILL_TEXT])),
})

/** A section of a brief: the lines between its title and the next title, a line ending with a colon. @param {string} prompt @param {string} title */
const sectionLines = (prompt, title) => {
  const lines = prompt.split('\n')
  const start = lines.indexOf(title)
  if (start < 0) return []
  const end = lines.findIndex((line, index) => index > start && line.endsWith(':'))
  return lines.slice(start + 1, end < 0 ? lines.length : end)
}

/** The `- Skills` section of a brief. @param {string} prompt */
const skillLines = (prompt) => sectionLines(prompt, '- Skills (read each before you start):')

const NOWHERE = '- Skills your components ask for that exist nowhere, in the plugin or the working copy:'

const WEB = Object.freeze({
  name: 'web', root: '../web', stack: 'react',
  paths: { src: ['src'], tests: ['tests'] },
  commands: { test: 'npm test' },
})

test("an agent's own skills stay out of its brief: only the skills of the components it drives open the brief, each once", async () => {
  const catalog = catalogOf(
    { 'solution-researcher': ['github-search', 'research-notes'], 'software-engineer': ['outside-in-tdd', 'mocking-inprocess-dotnet', 'craft-discipline'] },
    ['github-search', 'research-notes', 'outside-in-tdd', 'craft-discipline', 'mocking-inprocess-dotnet', 'contract-testing', 'contract-testing-dotnet'],
  )
  const host = scripted({ catalog }, (it) => nominal(it, REFS_42))

  await host.start({ story: { issue: 42, title: 'Pay by card' } })

  const [research, , , deliver] = host.agentRunner.dispatches.map((dispatch) => dispatch.prompt)
  assert.deepEqual(skillLines(research), [])
  assert.ok(deliver.includes([
    '- Attempt: 1 of 3',
    '- Skills (read each before you start):',
    '- /plugin/skills/mocking-inprocess-dotnet/SKILL.md',
    '- Read first:',
  ].join('\n')), deliver)
})

test('the agent of the TDD cycles reads the mocking skill of each component, and the contract testing skills only for a component that turns them on, each once; a JavaScript, TypeScript or React component mocks in process unless it names Microcks', async () => {
  const catalog = catalogOf(
    { 'software-engineer': ['outside-in-tdd'] },
    ['outside-in-tdd', 'mocking-inprocess-dotnet', 'mocking-microcks-dotnet', 'mocking-microcks-typescript', 'mocking-inprocess-typescript', 'contract-testing', 'contract-testing-dotnet'],
  )
  const ADMIN = { ...WEB, name: 'admin', root: '../admin', stack: 'javascript' }
  const SHOP = { ...WEB, name: 'shop', root: '../shop', stack: 'typescript', mocking: { strategy: 'microcks' } }
  const PAY = { ...API, name: 'pay', root: '../pay', contractTesting: true }
  const host = scripted({ catalog, components: [{ ...API, contractTesting: true }, WEB, ADMIN, SHOP, PAY] }, nominal)

  await host.start()

  const [research, design, distill, deliver] = host.agentRunner.dispatches.map((dispatch) => dispatch.prompt)
  const componentSkills = [
    '- /plugin/skills/mocking-inprocess-dotnet/SKILL.md',
    '- /plugin/skills/contract-testing/SKILL.md',
    '- /plugin/skills/contract-testing-dotnet/SKILL.md',
    '- /plugin/skills/mocking-inprocess-typescript/SKILL.md',
    '- /plugin/skills/mocking-microcks-typescript/SKILL.md',
  ]
  assert.deepEqual(skillLines(deliver), componentSkills)
  assert.deepEqual(skillLines(distill), [])
  assert.deepEqual(skillLines(research), [])
  assert.deepEqual(skillLines(design), [])
  assert.ok(distill.includes('- api: . (dotnet), mocking: inprocess, contract testing: on, tests: dotnet test\n'), distill)
  assert.ok(deliver.includes([
    '- Components:',
    '- api: . (dotnet), mocking: inprocess, contract testing: on, tests: dotnet test',
    '- web: ../web (react), mocking: inprocess, contract testing: off, tests: npm test',
    '- admin: ../admin (javascript), mocking: inprocess, contract testing: off, tests: npm test',
    '- shop: ../shop (typescript), mocking: microcks, contract testing: off, tests: npm test',
    '- pay: ../pay (dotnet), mocking: inprocess, contract testing: on, tests: dotnet test',
  ].join('\n')), deliver)
})

test('a skill found nowhere is named in the brief with its component, never read: Java has no mocking or contract testing skill, a JavaScript component no mocking skill and reads no TypeScript one, a TypeScript component no contract testing skill', async () => {
  const catalog = catalogOf({}, ['mocking-microcks-dotnet', 'contract-testing', 'mocking-inprocess-typescript', 'mocking-microcks-typescript'])
  const java = { name: 'orders', root: 'orders', stack: 'java', paths: { src: ['src/main'], tests: ['src/test'] }, commands: { test: 'mvn test' }, contractTesting: true }
  const admin = { ...WEB, name: 'admin', root: 'admin', stack: 'javascript' }
  const shop = { ...WEB, name: 'shop', root: 'shop', stack: 'typescript', mocking: { strategy: 'microcks' }, contractTesting: true }
  const host = scripted({ catalog, components: [java, admin, shop] }, (it) => [
    agent()(it),
    agent({ work: ({ git }) => git.commit('docs(checkout): ADR for the order', ['docs/adr/adr-001-order.md']) })(it),
    agent({ work: ({ git }) => git.commit('test(checkout): acceptance of the order', ['orders/src/test/OrderAcceptanceTest.java']) })(it),
    agent({ work: ({ git }) => git.commit('test(checkout): an order needs a line', ['orders/src/test/OrderTest.java']) })(it),
  ])

  await host.start()

  const [, , distill, deliver] = host.agentRunner.dispatches.map((dispatch) => dispatch.prompt)
  assert.deepEqual(skillLines(deliver), ['- /plugin/skills/contract-testing/SKILL.md', '- /plugin/skills/mocking-microcks-typescript/SKILL.md'])
  assert.deepEqual(sectionLines(deliver, NOWHERE), [
    '- mocking-microcks-java (orders)',
    '- contract-testing-java (orders)',
    '- mocking-inprocess-javascript (admin)',
    '- contract-testing-typescript (shop)',
  ])
  assert.deepEqual(sectionLines(distill, NOWHERE), [])
  assert.ok(deliver.includes('- orders: orders (java), mocking: microcks, contract testing: on, tests: mvn test\n'), deliver)
})
