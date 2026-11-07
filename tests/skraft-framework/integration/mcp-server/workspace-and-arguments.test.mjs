import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { git, skraft, tempFolder } from '../support/workspace.mjs'
import { mcpHost } from './mcp-host.mjs'

/** A folder whose active pipeline is `slug`, so that a status says which folder a tool ran in. */
export const pipelineFolder = async (t, slug) => {
  const cwd = join(tempFolder(t, 'skraft-mcp-'), slug)
  mkdirSync(cwd)
  assert.equal((await skraft(cwd, ['init', slug])).status, 0)
  return cwd
}

/** The slug of the pipeline a status call saw. @param {any} result */
const slugOf = (result) => JSON.parse(result.content[0].text).slug

/** The text of a refused call. @param {any} result */
const refusal = (result) => {
  assert.equal(result.isError, true)
  return result.content.map(({ text }) => text).join('\n')
}

test('a tool works in the one root the host shares, without being told which', async (t) => {
  const shop = await pipelineFolder(t, 'shop')
  const host = mcpHost({ roots: [shop], workingDirectory: await pipelineFolder(t, 'elsewhere') })
  await host.initialize()

  assert.equal(slugOf(await host.call('skraft_status')), 'shop')
  assert.equal(host.received.filter(({ method }) => method === 'roots/list').length, 1)
  await host.close()
})

test('with several roots, a tool needs the workspace argument, by folder name or by path, and refuses one the host does not share', async (t) => {
  const shop = await pipelineFolder(t, 'shop')
  const bank = await pipelineFolder(t, 'bank')
  const host = mcpHost({ roots: [shop, bank] })
  await host.initialize()

  assert.equal(refusal(await host.call('skraft_status')), 'several-workspaces: the host shares several root folders; name one with the workspace argument: shop, bank')
  assert.equal(slugOf(await host.call('skraft_status', { workspace: 'bank' })), 'bank')
  assert.equal(slugOf(await host.call('skraft_status', { workspace: shop })), 'shop')
  assert.equal(refusal(await host.call('skraft_status', { workspace: 'payroll' })), 'unknown-workspace: the workspace argument names none of the root folders the host shares: shop, bank')
  await host.close()
})

test('a host without roots, or one that lists none, has the tool work in the folder it started the server in; started in the plugin, no tool runs', async (t) => {
  const shop = await pipelineFolder(t, 'shop')
  for (const roots of [null, []]) {
    const host = mcpHost({ roots, workingDirectory: shop })
    await host.initialize()
    assert.equal(slugOf(await host.call('skraft_status')), 'shop')
    await host.close()
  }
  const lost = mcpHost({ roots: null, workingDirectory: null })
  await lost.initialize()
  assert.equal(refusal(await lost.call('skraft_status')), 'no-workspace: the host shares no root folder and started skraft outside a repository; call the tool again with the workspace argument set to the absolute path of the working copy')
  assert.equal(lost.received.some(({ method }) => method === 'roots/list'), false)
  await lost.close()
})

test('a host that shares no folder and starts the server in the plugin has a tool work in the git working copy the workspace argument names by its absolute path', async (t) => {
  const shop = await pipelineFolder(t, 'shop')
  git(shop, 'init', '-q')
  mkdirSync(join(shop, 'src'))
  const plain = await pipelineFolder(t, 'plain')
  const plugin = join(tempFolder(t, 'skraft-plugin-'), 'skraft-framework')
  mkdirSync(join(plugin, 'engine'), { recursive: true })
  git(plugin, 'init', '-q')
  const refusals = {
    relative: 'relative-workspace: the host shares no root folder, so the workspace argument must be the absolute path of the working copy',
    plugin: 'plugin-workspace: the workspace argument names a folder inside the skraft plugin; give the absolute path of the working copy instead',
    copy: 'no-working-copy: the workspace argument names no root folder of a git working copy; give the absolute path of the folder that holds the working copy',
  }
  for (const roots of [null, []]) {
    const host = mcpHost({ roots, workingDirectory: null, pluginFolder: plugin })
    await host.initialize()
    assert.equal(slugOf(await host.call('skraft_status', { workspace: shop })), 'shop')
    assert.equal(slugOf(await host.call('skraft_status', { workspace: join(shop, 'src', '..') })), 'shop')
    for (const named of ['shop', join('..', 'shop')]) assert.equal(refusal(await host.call('skraft_status', { workspace: named })), refusals.relative)
    for (const named of [plugin, join(plugin, 'engine')]) assert.equal(refusal(await host.call('skraft_status', { workspace: named })), refusals.plugin)
    for (const named of [join(shop, 'src'), plain, join(shop, 'missing')]) assert.equal(refusal(await host.call('skraft_status', { workspace: named })), refusals.copy)
    await host.close()
  }
})

test('a host that never lists its roots has the tool work in the folder it started the server in, once the server stops waiting', async (t) => {
  const shop = await pipelineFolder(t, 'shop')
  const host = mcpHost({ roots: [], answersRoots: false, workingDirectory: shop, patienceMs: 50 })
  await host.initialize()

  assert.equal(slugOf(await host.call('skraft_status')), 'shop')
  await host.close()
})

test('a host that closes the connection while the server waits for its roots runs no tool', async (t) => {
  const shop = await pipelineFolder(t, 'shop')
  const host = mcpHost({ roots: [shop], answersRoots: false, workingDirectory: shop, patienceMs: 60_000 })
  await host.initialize()
  const result = host.call('skraft_start', { slug: 'refund' })
  await new Promise((resolve) => setImmediate(resolve))

  const code = await host.close()

  assert.equal(code, 0)
  assert.deepEqual(await result, { content: [{ type: 'text', text: 'closed: the host closed the connection; nothing ran' }], isError: true })
  const after = mcpHost({ workingDirectory: shop })
  assert.equal(slugOf(await after.call('skraft_status')), 'shop')
  await after.close()
})

test('arguments a tool does not take, of the wrong kind, starting with a dash or missing are refused before anything runs, and the refusal never repeats what the model wrote', async (t) => {
  const shop = await pipelineFolder(t, 'shop')
  const host = mcpHost({ roots: [shop] })
  await host.initialize()

  for (const [name, args, text] of [
    ['skraft_status', { verbose: 'rm -rf /' }, 'skraft_status takes only these arguments: workspace'],
    ['skraft_start', {}, 'skraft_start needs the argument slug'],
    ['skraft_start', { slug: '--from-artifacts' }, 'the argument slug of skraft_start must be a non-empty text that does not start with -'],
    ['skraft_start', { slug: '' }, 'the argument slug of skraft_start must be a non-empty text that does not start with -'],
    ['skraft_start', { slug: 'refund', issue: 0 }, 'the argument issue of skraft_start must be a positive whole number'],
    ['skraft_start', { slug: 'refund', issue: 1.5 }, 'the argument issue of skraft_start must be a positive whole number'],
    ['skraft_start', { slug: 'refund', issue: '42' }, 'the argument issue of skraft_start must be a positive whole number'],
    ['skraft_start', { slug: 'refund', fromArtifacts: 'yes' }, 'the argument fromArtifacts of skraft_start must be true or false'],
    ['skraft_init', { add: ['api', '-x'] }, 'the argument add of skraft_init must be a list of non-empty texts that do not start with -'],
    ['skraft_init', { add: 'api' }, 'the argument add of skraft_init must be a list of non-empty texts that do not start with -'],
    ['skraft_review', { record: true }, 'skraft_review needs the argument pr'],
    ['skraft_status', null, 'skraft_status takes its arguments as an object'],
    ['skraft_status', ['shop'], 'skraft_status takes its arguments as an object'],
  ]) assert.deepEqual(await host.call(name, args), { content: [{ type: 'text', text }], isError: true }, `${name} ${JSON.stringify(args)}`)

  assert.deepEqual((await host.request('tools/call', { name: 'skraft_decide', arguments: {} })).error, { code: -32602, message: 'Unknown tool' })
  assert.equal(host.received.some(({ method }) => method === 'roots/list'), false)
  assert.equal(slugOf(await host.call('skraft_status')), 'shop')
  await host.close()
})
