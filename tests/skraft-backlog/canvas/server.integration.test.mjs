// The loopback server every canvas panel shares, over real HTTP: the page carries the per-process
// token, every call needs it, the Host must be the loopback address, and errors are answered as
// status codes the panel can show.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { request } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { UserError, createController } from '../../../plugins/skraft-backlog/prd-backlog/canvas/controller.mjs'
import { startServer } from '../../../plugins/skraft-backlog/prd-backlog/canvas/server.mjs'
import { fakeGitHub } from '../prd-backlog/fake-github.mjs'
import { SLUG, makeWorkspace } from './workspace.mjs'

/** A controller whose actions answer as told: one echoes its input, one is refused, one crashes. */
const fakeController = () => {
  const state = { version: 1 }
  return {
    state,
    events: new EventEmitter(),
    snapshot: () => ({ version: state.version }),
    actions: [
      { name: 'echo', run: async (input) => ({ echoed: input }) },
      { name: 'nothing', run: async () => undefined },
      { name: 'refuse', run: async () => { throw new UserError('ids must list story ids') } },
      { name: 'crash', run: async () => { throw new TypeError('cannot read x of undefined') } },
    ],
  }
}

const serve = async (t, controller = fakeController()) => {
  const errors = []
  const server = await startServer({ controller: /** @type {any} */ (controller), onError: (error) => errors.push(error.message) })
  t.after(() => server.close())
  const { port } = new URL(server.url)
  return { server, controller, errors, port: Number(port), host: `127.0.0.1:${port}` }
}

/**
 * One HTTP request to the server, the Host header set as asked.
 * @param {{ port: number, path: string, method?: string, headers?: Record<string, string>, body?: string | Buffer }} options
 * @returns {Promise<{ status: number, headers: import('node:http').IncomingHttpHeaders, text: string, json: any }>}
 */
const call = ({ port, path, method = 'GET', headers = {}, body }) => new Promise((resolve, reject) => {
  const req = request({ host: '127.0.0.1', port, path, method, headers, agent: false }, (res) => {
    const chunks = []
    res.on('data', (chunk) => chunks.push(chunk))
    res.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      let json = null
      try { json = JSON.parse(text) } catch { /* not JSON */ }
      resolve({ status: res.statusCode ?? 0, headers: res.headers, text, json })
    })
  })
  req.on('error', reject)
  req.end(body)
})

/** Opens the event stream and yields each `data:` frame as it arrives. */
const openEvents = (port, path) => new Promise((resolve, reject) => {
  const req = request({ host: '127.0.0.1', port, path, agent: false }, (res) => {
    const frames = []
    const waiting = []
    let buffer = ''
    res.setEncoding('utf8')
    res.on('data', (chunk) => {
      buffer += chunk
      let end
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        if (!frame.startsWith('data: ')) continue
        const value = JSON.parse(frame.slice(6))
        const next = waiting.shift()
        if (next) next(value)
        else frames.push(value)
      }
    })
    const ended = new Promise((done) => res.on('end', done))
    resolve({
      status: res.statusCode, headers: res.headers, ended,
      next: () => (frames.length ? Promise.resolve(frames.shift()) : new Promise((done) => waiting.push(done))),
      close: () => req.destroy(),
    })
  })
  req.on('error', reject)
  req.end()
})

test('the page carries the token of the process, under a strict content security policy', async (t) => {
  const { server, port, host } = await serve(t)
  assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+\/$/)
  assert.match(server.token, /^[0-9a-f]{48}$/)
  for (const path of ['/', '/index.html']) {
    const page = await call({ port, path, headers: { Host: host } })
    assert.equal(page.status, 200, path)
    assert.match(page.headers['content-type'], /^text\/html/)
    assert.ok(page.text.includes(`<meta name="canvas-token" content="${server.token}">`), 'the token is in the page')
    assert.ok(!page.text.includes('__CANVAS_TOKEN__'), 'no placeholder is left')
    assert.match(page.headers['content-security-policy'], /default-src 'none'; script-src 'self'/)
    assert.equal(page.headers['cache-control'], 'no-store')
    assert.equal(page.headers['x-content-type-options'], 'nosniff')
    assert.equal(page.headers['referrer-policy'], 'no-referrer')
  }
})

test('two servers carry two different tokens', async (t) => {
  const first = await serve(t)
  const second = await serve(t)
  assert.notEqual(first.server.token, second.server.token)
  assert.notEqual(first.port, second.port)
})

test('the panel files are served with their type; nothing else of the disk is', async (t) => {
  const { port, host } = await serve(t)
  const i18n = await call({ port, path: '/i18n.mjs', headers: { Host: host } })
  assert.equal(i18n.status, 200)
  assert.equal(i18n.headers['content-type'], 'text/javascript; charset=utf-8')
  assert.match(i18n.text, /export const format/)
  const styles = await call({ port, path: '/styles.css', headers: { Host: host } })
  assert.equal(styles.headers['content-type'], 'text/css; charset=utf-8')
  for (const path of ['/server.mjs', '/../store.mjs', '/ui/i18n.mjs', '/%2e%2e/store.mjs', '/package.json']) {
    const answer = await call({ port, path, headers: { Host: host } })
    assert.equal(answer.status, 404, path)
    assert.deepEqual(answer.json, { error: 'Not found' })
  }
})

test('a request for another host is misdirected, whatever it asks', async (t) => {
  const { server, port } = await serve(t)
  for (const host of ['localhost', 'evil.example', `localhost:${port}`, `127.0.0.1:${port + 1}`]) {
    const page = await call({ port, path: '/', headers: { Host: host } })
    assert.equal(page.status, 421, host)
    assert.deepEqual(page.json, { error: 'Misdirected request' })
    const api = await call({ port, path: '/api/echo', method: 'POST', headers: { Host: host, 'X-Canvas-Token': server.token } })
    assert.equal(api.status, 421, host)
  }
})

test('the event stream needs the token, then sends the state at once and again on every change', async (t) => {
  const { server, controller, port } = await serve(t)
  for (const path of ['/events', '/events?token=wrong', `/events?token=${server.token.toUpperCase()}x`]) {
    const refused = await call({ port, path })
    assert.equal(refused.status, 403, path)
    assert.deepEqual(refused.json, { error: 'Forbidden' })
  }
  const stream = await openEvents(port, `/events?token=${server.token}`)
  t.after(() => stream.close())
  assert.equal(stream.status, 200)
  assert.equal(stream.headers['content-type'], 'text/event-stream')
  assert.deepEqual(await stream.next(), { version: 1 })
  controller.state.version = 2
  controller.events.emit('change')
  assert.deepEqual(await stream.next(), { version: 2 })
  controller.state.version = 3
  server.broadcast()
  assert.deepEqual(await stream.next(), { version: 3 })
})

test('an action needs the token in its header, and must exist', async (t) => {
  const { server, port, host } = await serve(t)
  const post = (path, headers = {}, body = '{}') => call({ port, path, method: 'POST', headers: { Host: host, 'Content-Type': 'application/json', ...headers }, body })
  assert.equal((await post('/api/echo')).status, 403)
  assert.equal((await post('/api/echo', { 'X-Canvas-Token': 'nope' })).status, 403)
  assert.equal((await post(`/api/echo?token=${server.token}`)).status, 403, 'the token in the query is not enough for an action')
  const unknown = await post('/api/drop_tables', { 'X-Canvas-Token': server.token })
  assert.equal(unknown.status, 404)
  assert.deepEqual(unknown.json, { error: 'Unknown action' })
  const get = await call({ port, path: '/api/echo', headers: { Host: host, 'X-Canvas-Token': server.token } })
  assert.equal(get.status, 404, 'an action is a POST')
})

test('an action runs with the JSON object of the body and answers its result', async (t) => {
  const { server, port, host } = await serve(t)
  const post = (path, body) => call({ port, path, method: 'POST', headers: { Host: host, 'X-Canvas-Token': server.token }, body })
  const echoed = await post('/api/echo', JSON.stringify({ ids: ['EP-001-S01'] }))
  assert.equal(echoed.status, 200)
  assert.equal(echoed.headers['content-type'], 'application/json; charset=utf-8')
  assert.deepEqual(echoed.json, { result: { echoed: { ids: ['EP-001-S01'] } } })
  assert.deepEqual((await post('/api/echo', '')).json, { result: { echoed: {} } }, 'an empty body is an empty object')
  assert.deepEqual((await post('/api/nothing', '{}')).json, { result: null })
})

test('a body that is not a JSON object, or is too large, is a bad request', async (t) => {
  const { server, port, host, errors } = await serve(t)
  const post = (body) => call({ port, path: '/api/echo', method: 'POST', headers: { Host: host, 'X-Canvas-Token': server.token }, body })
  assert.deepEqual([(await post('{ not json')).status, (await post('{ not json')).json], [400, { error: 'Invalid JSON body' }])
  for (const body of ['[1, 2]', 'null', '42', '"text"']) {
    const answer = await post(body)
    assert.deepEqual([answer.status, answer.json], [400, { error: 'The body must be a JSON object' }], body)
  }
  const large = await post(JSON.stringify({ text: 'x'.repeat(300 * 1024) }))
  assert.deepEqual([large.status, large.json], [400, { error: 'Request body too large' }])
  assert.deepEqual(errors, [], 'a bad request is no server error')
})

test('a refused action is a bad request; a crash is a server error reported to the host', async (t) => {
  const { server, port, host, errors } = await serve(t)
  const post = (path) => call({ port, path, method: 'POST', headers: { Host: host, 'X-Canvas-Token': server.token }, body: '{}' })
  const refused = await post('/api/refuse')
  assert.deepEqual([refused.status, refused.json], [400, { error: 'ids must list story ids' }])
  const crashed = await post('/api/crash')
  assert.deepEqual([crashed.status, crashed.json], [500, { error: 'cannot read x of undefined' }])
  assert.deepEqual(errors, ['cannot read x of undefined'])
})

test('close ends the open streams and stops listening to the controller', async (t) => {
  const controller = fakeController()
  const server = await startServer({ controller: /** @type {any} */ (controller) })
  const { port } = new URL(server.url)
  const stream = await openEvents(Number(port), `/events?token=${server.token}`)
  await stream.next()
  assert.equal(controller.events.listenerCount('change'), 1)
  await server.close()
  await stream.ended
  assert.equal(controller.events.listenerCount('change'), 0)
  await assert.rejects(call({ port: Number(port), path: '/' }), /ECONNREFUSED/)
})

test('over the real controller, the panel reads the backlog and a refused review is a 400', async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), 'skraft-canvas-server-'))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  await makeWorkspace(cwd)
  const controller = createController({ cwd, gh: fakeGitHub().run })
  await controller.reload()
  const { server, port, host } = await serve(t, controller)
  const stream = await openEvents(port, `/events?token=${server.token}`)
  t.after(() => stream.close())
  const first = await stream.next()
  assert.equal(first.slug, SLUG)
  assert.equal(first.assessment.counts.ready, 2)
  const post = (action, body) => call({ port, path: `/api/${action}`, method: 'POST', headers: { Host: host, 'X-Canvas-Token': server.token }, body: JSON.stringify(body) })
  const refused = await post('mark_reviewed', { ids: ['EP-001-S02'] })
  assert.deepEqual([refused.status, refused.json], [400, { error: 'only ready stories can be reviewed: EP-001-S02 is refused' }])
  const focused = await post('focus_story', { id: 'EP-001-S03' })
  assert.deepEqual(focused.json, { result: { focus: 'EP-001-S03' } })
  let frame = await stream.next()
  while (frame.focus !== 'EP-001-S03') frame = await stream.next()
  assert.equal(frame.focus, 'EP-001-S03', 'the panel sees the focus the agent set')
})
