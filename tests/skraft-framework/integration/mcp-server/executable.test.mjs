import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import { PLUGIN_ROOT, SKRAFT_MJS, skraft, tempFolder } from '../support/workspace.mjs'

/**
 * `node skraft.mjs mcp` started by a host in `cwd`: requests written to its stdin, every line of
 * its stdout read back, `roots/list` answered with `roots` when the host has them.
 * @param {import('node:test').TestContext} t @param {string} cwd @param {string[] | null} roots
 */
const serverProcess = (t, cwd, roots) => {
  const child = spawn(process.execPath, [SKRAFT_MJS, 'mcp'], { cwd, env: { ...process.env, HOME: `${cwd}-home`, USERPROFILE: `${cwd}-home` }, stdio: ['pipe', 'pipe', 'pipe'] })
  t.after(() => child.kill())
  const lines = []
  const waiting = new Map()
  const write = (message) => child.stdin.write(`${JSON.stringify(message)}\n`)
  createInterface({ input: child.stdout }).on('line', (line) => {
    lines.push(line)
    const message = JSON.parse(line)
    if (message.method === 'roots/list') write({ jsonrpc: '2.0', id: message.id, result: { roots: roots.map((folder) => ({ uri: pathToFileURL(folder).href })) } })
    else waiting.get(message.id)?.(message)
  })
  const exited = new Promise((resolve) => child.on('close', (code) => resolve(code)))
  let id = 0
  const request = (method, params) => {
    id += 1
    const answered = new Promise((resolve) => waiting.set(id, resolve))
    write({ jsonrpc: '2.0', id, method, params })
    return answered
  }
  const capabilities = roots === null ? {} : { roots: {} }
  return {
    lines,
    start: () => request('initialize', { protocolVersion: '2025-06-18', capabilities, clientInfo: { name: 'test-host', version: '1' } }),
    status: async () => (await request('tools/call', { name: 'skraft_status', arguments: {} })).result,
    end: () => {
      child.stdin.end()
      return exited
    },
  }
}

test('the executable serves the host on stdin and stdout, writes only protocol lines to stdout, and ends with 0 when the host closes stdin', async (t) => {
  const cwd = tempFolder(t, 'skraft-mcp-')
  await skraft(cwd, ['init', 'checkout'])
  const server = serverProcess(t, cwd, null)

  const { result } = await server.start()
  const status = await server.status()

  assert.equal(result.serverInfo.version, JSON.parse(readFileSync(join(PLUGIN_ROOT, 'plugin.json'), 'utf8')).version)
  assert.equal(JSON.parse(status.content[0].text).slug, 'checkout')
  assert.equal(await server.end(), 0)
  for (const line of server.lines) assert.equal(JSON.parse(line).jsonrpc, '2.0')
})

test('started in the plugin\'s own folder, as a host does from mcp.json, the executable works in the root the host shares, and in none without one', async (t) => {
  const cwd = tempFolder(t, 'skraft-mcp-')
  await skraft(cwd, ['init', 'checkout'])
  const shared = serverProcess(t, PLUGIN_ROOT, [cwd])
  const alone = serverProcess(t, PLUGIN_ROOT, null)
  await shared.start()
  await alone.start()

  assert.equal(JSON.parse((await shared.status()).content[0].text).slug, 'checkout')
  assert.deepEqual(await alone.status(), {
    content: [{ type: 'text', text: 'no-workspace: the host shares no root folder and started skraft outside a repository; open the repository in the host' }], isError: true,
  })
  assert.deepEqual([await shared.end(), await alone.end()], [0, 0])
})
