import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'

const server = fileURLToPath(new URL('../../../../plugins/skraft-design/engine/drivers/cli/server.mjs', import.meta.url))
const ciConsent = fileURLToPath(new URL('../../../../plugins/skraft-design/engine/drivers/cli/ci-consent.mjs', import.meta.url))

/** A working copy whose remote names acme/shop, and a home of its own, both under a folder with a space. */
const projectWith = async (t) => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'skraft design setup ')))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const workspace = join(directory, 'project with spaces')
  const home = join(directory, 'home')
  await mkdir(workspace)
  await mkdir(home)
  for (const args of [['init', '--quiet', '--initial-branch=main'], ['remote', 'add', 'origin', 'https://github.com/acme/shop.git']]) {
    const result = spawnSync('git', args, { cwd: workspace, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  }
  return { workspace, home }
}

test('setup keeps the publication consent in the developer\'s own settings for this repository and writes nothing in the working copy', async (t) => {
  const { workspace, home } = await projectWith(t)
  const client = connect(t, workspace, home)
  await client.call('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'Claude Code', version: 'test' } })
  const asked = await client.tool('skraft_design_setup', { workspace })
  assert.deepEqual(asked.questions.map(({ key }) => key), ['pullRequest'])
  const answered = await client.tool('skraft_design_setup', { workspace, pullRequest: true })
  assert.deepEqual(answered.questions, [])
  const own = JSON.parse(readFileSync(join(home, '.skraft-design', 'config.json'), 'utf8'))
  assert.equal(own.repositories['github.com/acme/shop'].publish.pullRequest, true)
  for (const file of ['skraft-design-config.json', 'skraft-design-config.local.json', '.gitignore']) assert.equal(existsSync(join(workspace, file)), false, file)
  assert.equal(spawnSync('git', ['status', '--porcelain'], { cwd: workspace, encoding: 'utf8' }).stdout, '')
})

test('the CI workflow that a team commits gives the publication consent for its repository, in the job\'s own home, and writes nothing in the working copy', async (t) => {
  const { workspace, home } = await projectWith(t)
  const result = spawnSync(process.execPath, [ciConsent], { cwd: workspace, encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home } })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.deepEqual(JSON.parse(result.stdout.trim().split('\n').at(-1)).questions, [])
  const own = JSON.parse(readFileSync(join(home, '.skraft-design', 'config.json'), 'utf8'))
  assert.equal(own.repositories['github.com/acme/shop'].publish.pullRequest, true)
  assert.equal(spawnSync('git', ['status', '--porcelain', '--ignored'], { cwd: workspace, encoding: 'utf8' }).stdout, '')
})

const connect = (t, workspace, home) => {
  const child = spawn(process.execPath, [server], { cwd: workspace, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, HOME: home, USERPROFILE: home } })
  const pending = new Map()
  let serial = 0
  const lines = createInterface({ input: child.stdout })
  lines.on('line', (text) => {
    const message = JSON.parse(text)
    if (pending.has(message.id)) pending.get(message.id)(message)
  })
  t.after(() => {
    lines.close()
    child.stdin.end()
    if (child.exitCode === null) child.kill()
  })
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial
    const timeout = setTimeout(() => reject(new Error(`MCP ${method} timed out`)), 15_000)
    pending.set(id, (message) => { clearTimeout(timeout); pending.delete(id); resolve(message) })
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  })
  const tool = async (name, args) => {
    const answer = await call('tools/call', { name, arguments: args })
    assert.equal(answer.result.isError, false, JSON.stringify(answer))
    return JSON.parse(answer.result.content[0].text)
  }
  return { call, tool }
}
