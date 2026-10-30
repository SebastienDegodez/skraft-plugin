import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { PLUGIN_ROOT, workingCopy } from '../copilot-workflow/simulated-host.mjs'
import { git } from '../support/workspace.mjs'
import { BOUNDED, CanvasError, contentStream, pipelineCanvas, pluginCopy, request, tokenOf, within } from './canvas-host.mjs'

const API = Object.freeze({ name: 'mastermind-api', root: '.', stack: 'dotnet', commands: { build: 'dotnet build', test: 'dotnet test' } })

/** A working copy (a git repository, as a developer's is) with one .NET component, and the canvas of a session in it; `more` is what the canvas takes besides. */
const configured = async (t, where = {}, more = {}) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  git(cwd, 'init', '-q')
  writeFileSync(join(cwd, 'skraft-config.json'), JSON.stringify({ publish: { pullRequest: false }, components: [API] }))
  where.cwd = cwd
  return { cwd, ...pipelineCanvas(t, { directory: () => where.cwd ?? null, home: `${cwd}-home`, more }) }
}

/** A save as the page sends it. */
const saving = (url, token, body, headers = {}) => request(new URL('/configuration', url).href, {
  method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
  headers: { 'content-type': 'application/json', 'x-skraft-token': token, origin: new URL(url).origin, ...headers },
})

const team = (cwd) => JSON.parse(readFileSync(join(cwd, 'skraft-config.json'), 'utf8'))

test('the canvas opens on the tab asked, and its page gets the configuration and the workflows beside the run; the model reads the configuration through a read-only action', BOUNDED, async (t) => {
  const { cwd, open, canvas } = await configured(t)
  git(cwd, 'init', '-q')
  git(cwd, 'remote', 'add', 'origin', 'https://dev.azure.com/acme/mastermind/_git/mastermind')

  const { url } = await open('panel-1', { tab: 'configuration' })

  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f]{48}&tab=configuration$/)
  const content = await contentStream(t, url, await tokenOf(url)).next()
  assert.deepEqual([content.title, content.status], ['skraft pipeline', 'idle'])
  assert.deepEqual([content.configuration.status, content.configuration.components, content.configuration.confirmed], [
    'ok', [{ name: 'mastermind-api', root: '.', stack: 'dotnet', commands: API.commands, mocking: 'microcks', contractTesting: false }], true,
  ])
  assert.deepEqual([content.configuration.forge, content.configuration.choices.forges], [{ named: null, namedIn: null, deduced: 'azure-devops' }, ['github', 'azure-devops']])
  assert.deepEqual(content.workflows.map(({ name, file }) => [name, file]), [['pipeline', null], ['review', null]])
  const action = canvas.actions.find(({ name }) => name === 'get_configuration')
  assert.deepEqual(await action.handler({ instanceId: 'panel-1', actionName: 'get_configuration', input: {} }), content.configuration)
})

test('a save from the page writes the configuration and sends the page what it now holds; one the configuration refuses writes nothing and says why', BOUNDED, async (t) => {
  const { cwd, open } = await configured(t)
  const { url } = await open()
  const token = await tokenOf(url)
  const stream = contentStream(t, url, token)
  await stream.next()

  const saved = await saving(url, token, { forge: 'azure-devops', components: [{ name: 'mastermind-api', commands: { build: 'dotnet build', test: 'dotnet test --no-build' } }] })

  assert.deepEqual([saved.status, JSON.parse(saved.text)], [200, { ok: true, reason: 'skraft-config.json saved' }])
  assert.deepEqual(team(cwd).components[0].commands, { build: 'dotnet build', test: 'dotnet test --no-build' })
  assert.equal(team(cwd).forge, 'azure-devops')
  const shown = (await stream.next()).configuration
  assert.deepEqual([shown.components[0].commands.test, shown.forge.named], ['dotnet test --no-build', 'azure-devops'])

  const refused = await saving(url, token, { components: [{ name: 'mastermind-api', stack: 'cobol' }] })
  assert.deepEqual([refused.status, JSON.parse(refused.text)], [422, {
    ok: false, reason: 'skraft-config.json is invalid: component mastermind-api: stack must be one of dotnet, java, python, typescript, javascript, react',
  }])
  assert.equal(team(cwd).components[0].stack, 'dotnet')
})

test('a save that does not come from the panel\'s page is refused and writes nothing: no token or another, another origin or site, no JSON, too large a body', BOUNDED, async (t) => {
  const { cwd, open } = await configured(t)
  const { url } = await open()
  const token = await tokenOf(url)
  const edit = { components: [{ name: 'mastermind-api', stack: 'java' }] }

  const refusals = [
    [await saving(url, '', edit), 403, 'this request does not come from the panel'],
    [await saving(url, 'f'.repeat(48), edit), 403, 'this request does not come from the panel'],
    [await saving(url, token, edit, { origin: 'http://evil.example' }), 403, 'this request does not come from the panel'],
    [await saving(url, token, edit, { 'sec-fetch-site': 'cross-site' }), 403, 'this request does not come from the panel'],
    [await saving(url, token, edit, { 'sec-fetch-site': 'same-site' }), 403, 'this request does not come from the panel'],
    [await saving(url, token, JSON.stringify(edit), { 'content-type': 'text/plain' }), 415, 'the panel sends its edits as JSON'],
    [await saving(url, token, 'not json'), 400, 'the request holds no configuration edit'],
    [await saving(url, token, '[1]'), 400, 'the request holds no configuration edit'],
    [await saving(url, token, JSON.stringify({ ...edit, padding: 'x'.repeat(70_000) })), 413, 'the edit is larger than the panel sends'],
  ]
  for (const [answer, status, error] of refusals) assert.deepEqual([answer.status, JSON.parse(answer.text)], [status, { error }])
  assert.equal(team(cwd).components[0].stack, 'dotnet')
})

test('an edit that names __proto__ as an agent is refused in the engine\'s words, writes nothing and changes no object', BOUNDED, async (t) => {
  const { cwd, open } = await configured(t)
  const { url } = await open()
  const before = readFileSync(join(cwd, 'skraft-config.json'), 'utf8')
  // Raw text: JSON.stringify of a literal __proto__ would set the prototype and send no key.
  const edit = '{"assign":{"agents":{"__proto__":{"family":"economy","polluted":true}}}}'

  const refused = await saving(url, await tokenOf(url), edit)

  assert.equal(refused.status, 422)
  assert.equal(JSON.parse(refused.text).ok, false)
  assert.match(JSON.parse(refused.text).reason, /assign\.agents: "__proto__" must be a kebab-case agent id/)
  assert.equal(readFileSync(join(cwd, 'skraft-config.json'), 'utf8'), before)
  assert.equal(/** @type {any} */ ({}).polluted, undefined)
})

test('without a working directory, or with a configuration the files make invalid, the tab says so in the engine\'s words and nothing is saved', BOUNDED, async (t) => {
  const where = { cwd: null }
  const { cwd, open, canvas } = await configured(t, where)
  where.cwd = null
  const { url } = await open()
  const token = await tokenOf(url)
  const get = () => canvas.actions.find(({ name }) => name === 'get_configuration').handler({ instanceId: 'panel-1', input: {} })

  assert.deepEqual(await get(), { status: 'no-directory', code: 'no-directory', reason: 'The Copilot session has no working directory yet.' })
  assert.deepEqual(JSON.parse((await saving(url, token, { consents: { pullRequest: true } })).text), { ok: false, code: 'no-directory', reason: 'The Copilot session has no working directory yet.' })

  where.cwd = cwd
  writeFileSync(join(cwd, 'skraft-config.json'), JSON.stringify({ components: [{ ...API, stack: 'cobol' }] }))
  const invalid = 'skraft-config.json is invalid: component mastermind-api: stack must be one of dotnet, java, python, typescript, javascript, react'
  assert.deepEqual(await get(), { status: 'invalid', reason: invalid })
})

test('the canvas opens on a tab it has only: any other tab, or any other key, is refused', BOUNDED, async (t) => {
  const { open } = await configured(t)

  for (const input of [{ tab: 'settings' }, { tab: 'configuration', slug: 'checkout' }, { tab: 1 }]) {
    await assert.rejects(open('panel-1', input), (error) => error instanceof CanvasError && error.code === 'skraft_invalid_input'
      && error.message === 'the skraft-pipeline canvas takes only tab, one of run, configuration and workflow; it shows the active pipeline of this working copy')
  }
  for (const tab of ['run', 'workflow']) assert.match((await open(`panel-${tab}`, { tab })).url, new RegExp(`&tab=${tab}$`))
})


/** The pipeline workflow with the lens `lens` added to the design review, and nothing else changed. @param {string} workflow @param {string} lens */
const withLens = (workflow, lens) => workflow
  .replace('  design_review [shape=tripleoctagon, mandatory=true]\n', `  design_review_${lens} [shape=note, lens="${lens}"]\n  design_review [shape=tripleoctagon, mandatory=true]\n`)
  .replace('  design_review_lenses -> design_review_fitness -> design_review\n', `  design_review_lenses -> design_review_fitness -> design_review\n  design_review_lenses -> design_review_${lens} -> design_review\n`)

/** The agent of the lens `lens`, as the working copy of `side` (.claude or .github) names its file, listing the skill `<lens>-rules`. */
const lensAgent = (cwd, side, lens) => {
  mkdirSync(join(cwd, side, 'agents'), { recursive: true })
  writeFileSync(join(cwd, side, 'agents', `${lens}-lens${side === '.github' ? '.agent' : ''}.md`), `---\nname: ${lens}-lens\ndescription: Reviews the design as ${lens}\nmetadata:\n  skills:\n    - ${lens}-rules\n---\nReview the design.\n`)
}

/** The skill `<lens>-rules`, in the skills folder of `side`. */
const lensSkill = (cwd, side, lens) => {
  mkdirSync(join(cwd, side, 'skills', `${lens}-rules`), { recursive: true })
  writeFileSync(join(cwd, side, 'skills', `${lens}-rules`, 'SKILL.md'), `---\nname: ${lens}-rules\ndescription: Rules of ${lens}\n---\nRules.\n`)
}

/**
 * An edit, then the content `until` accepts among what the page is sent: a page that listens is shown
 * the edit. The edit waits a few polls first, so that no read of the panel is under way: one that
 * took its digest before the edit would also read the edit, and show it whatever the digest says.
 */
const shownAfter = (t, stream) => async (edit, until) => {
  await delay(200, undefined, { signal: t.signal, ref: false })
  edit()
  assert.notEqual(await within(t, 10_000, stream.next(until)), 'still waiting', until.toString())
}

const lensesKnown = ({ workflows, configuration }) => workflows[0]?.file === '.skraft/pipeline.skraft.dot' && configuration.models.agents !== null
const lensesUnknown = ({ workflows, configuration }) => workflows[0]?.file === '.skraft/pipeline.skraft.dot' && configuration.models.agents === null

test('an open page shows each file a person edits as soon as it changes', BOUNDED, async (t) => {
  const { cwd, open } = await configured(t)
  const { url } = await open()
  const stream = contentStream(t, url, await tokenOf(url))
  await stream.next()
  const shows = shownAfter(t, stream)

  await shows(() => { mkdirSync(join(`${cwd}-home`, '.skraft'), { recursive: true }); writeFileSync(join(`${cwd}-home`, '.skraft', 'config.json'), JSON.stringify({ forge: 'azure-devops' })) },
    ({ configuration }) => configuration.forge.named === 'azure-devops' && configuration.forge.namedIn === '~/.skraft/config.json')
  await shows(() => git(cwd, 'remote', 'add', 'origin', 'https://dev.azure.com/acme/mastermind/_git/mastermind'), ({ configuration }) => configuration.forge.deduced === 'azure-devops')
  await shows(() => writeFileSync(join(cwd, 'skraft-config.local.json'), JSON.stringify({ configurationConfirmed: true, models: { economy: { copilot: { model: 'copilot-small' } } } })),
    ({ configuration }) => configuration.models.models.economy?.copilot?.model === 'copilot-small')
  // A lens of the repository whose agent and skill nobody provides yet: the ejected workflow is invalid until both are.
  let workflow = withLens(readFileSync(join(PLUGIN_ROOT, 'workflows', 'pipeline.skraft.dot'), 'utf8'), 'acme')
  mkdirSync(join(cwd, '.skraft'), { recursive: true })
  await shows(() => writeFileSync(join(cwd, '.skraft', 'pipeline.skraft.dot'), workflow), lensesUnknown)
  await shows(() => { lensAgent(cwd, '.claude', 'acme'); lensSkill(cwd, '.github', 'acme') }, lensesKnown)
  // Each other lens is written with all but one of what it needs, in the other folders; the one left, alone, makes it known again.
  for (const [lens, first, last] of [
    ['beta', () => lensAgent(cwd, '.claude', 'beta'), () => lensSkill(cwd, '.github', 'beta')],
    ['gamma', () => lensSkill(cwd, '.claude', 'gamma'), () => lensAgent(cwd, '.github', 'gamma')],
    ['delta', () => lensSkill(cwd, '.github', 'delta'), () => lensAgent(cwd, '.claude', 'delta')],
    ['epsilon', () => lensAgent(cwd, '.github', 'epsilon'), () => lensSkill(cwd, '.claude', 'epsilon')],
  ]) {
    workflow = withLens(workflow, lens)
    await shows(() => { writeFileSync(join(cwd, '.skraft', 'pipeline.skraft.dot'), workflow); first() }, lensesUnknown)
    await shows(last, lensesKnown)
  }
})

test('while nothing a person edits changes, an open page does not read the configuration and the workflows again; a page that arrives reads them again', BOUNDED, async (t) => {
  const plugin = pluginCopy(t)
  const { open } = await configured(t, {}, { pluginRoot: plugin })
  const { url } = await open()
  const token = await tokenOf(url)
  const stream = contentStream(t, url, token)
  assert.notEqual(JSON.parse((await stream.frame(isContent)).data).configuration.models.agents, null)

  // The plugin's own agent goes: the plugin does not change during a session, so nothing a person edits did.
  for (const descriptor of ['com.github.copilot/agents/solution-researcher.agent.md', 'com.anthropic.claude-code/agents/solution-researcher.md']) rmSync(join(plugin, ...descriptor.split('/')))

  assert.equal(await stream.frame(isContent, 1000), null)
  const arriving = contentStream(t, url, token)
  assert.equal((await within(t, 10_000, arriving.next())).configuration.models.agents, null)
})

const isContent = (frame) => frame.data !== undefined && frame.event === undefined
