import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { cp, mkdtemp, mkdir, realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'

for (const kind of ['design', 'deliver']) {
  for (const host of ['Claude Code', 'GitHub Copilot CLI']) {
    test(`${kind} installs alone and exposes only its own MCP tools to ${host}`, async (t) => {
      const directory = await realpath(await mkdtemp(join(tmpdir(), 'skraft standalone host ')))
      t.after(() => rm(directory, { recursive: true, force: true }))
      const plugin = join(directory, `skraft-${kind}`)
      await cp(fileURLToPath(new URL(`../../../../plugins/skraft-${kind}/`, import.meta.url)), plugin, { recursive: true, filter: (path) => !path.includes('node_modules') })
      const workspace = join(directory, 'project with spaces')
      await mkdir(workspace)
      const initialized = spawnSync('git', ['init', '--initial-branch=main'], { cwd: workspace, encoding: 'utf8' })
      assert.equal(initialized.status, 0, initialized.stderr)
      const client = connect(t, join(plugin, 'engine/drivers/cli/server.mjs'), workspace)
      const hello = await client.call('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: host, version: 'test' } })
      assert.equal(hello.result.serverInfo.name, `skraft-${kind}`)
      const listing = await client.call('tools/list')
      const tools = listing.result.tools
      assert.ok(tools.every(({ name }) => name.startsWith(`skraft_${kind}_`)))
      assert.ok(tools.some(({ name }) => name === `skraft_${kind}_start`))
      assert.ok(tools.every(({ inputSchema }) => inputSchema.additionalProperties === false))
      const refused = await client.call('tools/call', { name: `skraft_${kind}_start`, arguments: { workspace, executable: 'not-allowed' } })
      assert.equal(refused.result.isError, true)
      const setup = await client.call('tools/call', { name: `skraft_${kind}_setup`, arguments: { workspace } })
      assert.equal(setup.result.isError, false, JSON.stringify(setup))
      assert.ok(JSON.parse(setup.result.content[0].text).questions.some(({ key }) => key === 'pullRequest'))
      assert.equal(client.stderr(), '')
    })
  }
}

const connect = (t, server, workspace) => {
  const child = spawn(process.execPath, [server], { cwd: workspace, stdio: ['pipe', 'pipe', 'pipe'] })
  const pending = new Map()
  let serial = 0, stderr = ''
  child.stderr.setEncoding('utf8').on('data', (text) => { stderr += text })
  const lines = createInterface({ input: child.stdout })
  lines.on('line', (text) => {
    const message = JSON.parse(text)
    if (pending.has(message.id)) pending.get(message.id)(message)
  })
  t.after(async () => {
    lines.close()
    child.stdin.end()
    if (child.exitCode === null) child.kill()
  })
  return { stderr: () => stderr, call: (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial
    const timeout = setTimeout(() => reject(new Error(`MCP ${method} timed out`)), 15_000)
    pending.set(id, (message) => { clearTimeout(timeout); pending.delete(id); resolve(message) })
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  }) }
}
