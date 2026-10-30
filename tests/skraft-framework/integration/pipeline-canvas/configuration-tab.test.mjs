import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { workingCopy } from '../copilot-workflow/simulated-host.mjs'
import { git } from '../support/workspace.mjs'
import { BOUNDED, CanvasError, contentStream, pipelineCanvas, request, tokenOf } from './canvas-host.mjs'

const API = Object.freeze({ name: 'mastermind-api', root: '.', stack: 'dotnet', commands: { build: 'dotnet build', test: 'dotnet test' } })

/** A working copy with one .NET component, and the canvas of a session in it. */
const configured = async (t, where = {}) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  writeFileSync(join(cwd, 'skraft-config.json'), JSON.stringify({ publish: { pullRequest: false }, components: [API] }))
  where.cwd = cwd
  return { cwd, ...pipelineCanvas(t, { directory: () => where.cwd ?? null, home: `${cwd}-home` }) }
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

test('a save that does not come from the panel\'s page is refused and writes nothing: no token or another, another origin, no JSON, too large a body', BOUNDED, async (t) => {
  const { cwd, open } = await configured(t)
  const { url } = await open()
  const token = await tokenOf(url)
  const edit = { components: [{ name: 'mastermind-api', stack: 'java' }] }

  const refusals = [
    [await saving(url, '', edit), 403, 'this request does not come from the panel'],
    [await saving(url, 'f'.repeat(48), edit), 403, 'this request does not come from the panel'],
    [await saving(url, token, edit, { origin: 'http://evil.example' }), 403, 'this request does not come from the panel'],
    [await saving(url, token, JSON.stringify(edit), { 'content-type': 'text/plain' }), 415, 'the panel sends its edits as JSON'],
    [await saving(url, token, 'not json'), 400, 'the request holds no configuration edit'],
    [await saving(url, token, '[1]'), 400, 'the request holds no configuration edit'],
    [await saving(url, token, JSON.stringify({ ...edit, padding: 'x'.repeat(70_000) })), 413, 'the edit is larger than the panel sends'],
  ]
  for (const [answer, status, error] of refusals) assert.deepEqual([answer.status, JSON.parse(answer.text)], [status, { error }])
  assert.equal(team(cwd).components[0].stack, 'dotnet')
})

test('without a working directory, or with a configuration the files make invalid, the tab says so in the engine\'s words and nothing is saved', BOUNDED, async (t) => {
  const where = { cwd: null }
  const { cwd, open, canvas } = await configured(t, where)
  where.cwd = null
  const { url } = await open()
  const token = await tokenOf(url)
  const get = () => canvas.actions.find(({ name }) => name === 'get_configuration').handler({ instanceId: 'panel-1', input: {} })

  assert.deepEqual(await get(), { status: 'no-directory', reason: 'The Copilot session has no working directory yet.' })
  assert.deepEqual(JSON.parse((await saving(url, token, { consents: { pullRequest: true } })).text), { ok: false, reason: 'The Copilot session has no working directory yet.' })

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
