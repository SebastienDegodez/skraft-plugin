import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { handler } from '../src/server.mjs'

test('lists vehicles', async (t) => {
  const server = createServer(handler).listen(0)
  t.after(() => server.close())
  const { port } = server.address()
  const response = await fetch(`http://localhost:${port}/vehicles`)
  assert.equal(response.status, 200)
  assert.ok(Array.isArray(await response.json()))
})
