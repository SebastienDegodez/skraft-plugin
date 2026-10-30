import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PLUGIN_ROOT } from '../support/workspace.mjs'
import { workingCopy } from '../copilot-workflow/simulated-host.mjs'
import { BOUNDED, pipelineCanvas, request, tokenOf } from './canvas-host.mjs'

const UI = join(PLUGIN_ROOT, 'engine', 'drivers', 'copilot-workflow', 'canvas-ui')
const CORP = 'cross-origin-resource-policy'

/** An open panel on a working copy with no pipeline. */
const panel = async (t, instanceId = 'panel-1') => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const { open } = pipelineCanvas(t, { directory: () => cwd, home: `${cwd}-home` })
  return (await open(instanceId)).url
}

test('the page is served only at the url open gives, whose token it reads from its own address and never carries; it runs under default-src none and is never cached; its scripts and stylesheet are served as they are', BOUNDED, async (t) => {
  const url = await panel(t)
  const token = await tokenOf(url)

  const page = await request(url)
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f]{48}$/)
  assert.equal(page.status, 200)
  assert.equal(page.text, readFileSync(join(UI, 'index.html'), 'utf8'))
  assert.equal(page.text.includes(token), false)
  for (const without of ['/', '/?t=', `/?t=${'f'.repeat(48)}`, `/?token=${token}`]) {
    const refused = await request(new URL(without, url).href)
    assert.deepEqual([refused.status, JSON.parse(refused.text)], [403, { error: 'this request does not come from the panel' }])
  }
  assert.deepEqual([page.headers['content-type'], page.headers['cache-control'], page.headers['x-content-type-options'], page.headers['referrer-policy']], ['text/html; charset=utf-8', 'no-store', 'nosniff', 'no-referrer'])
  assert.equal(page.headers[CORP], undefined)
  assert.equal((await request(url, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 200)
  assert.equal(page.headers['content-security-policy'], "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'")
  for (const [path, type] of [...['app.js', 'view.js', 'i18n.js', 'reconnect.js'].map((script) => [script, 'text/javascript; charset=utf-8']), ['styles.css', 'text/css; charset=utf-8']]) {
    const served = await request(new URL(path, url).href)
    assert.deepEqual([served.status, served.headers['content-type'], served.headers['cache-control'], served.headers[CORP], served.text], [200, type, 'no-store', 'same-origin', readFileSync(join(UI, path), 'utf8')])
  }
})

test('each panel has its own token: the stream refuses no token, a token of the right length that is not its own, and another panel\'s', BOUNDED, async (t) => {
  const url = await panel(t)
  const other = await panel(t, 'panel-2')
  const token = await tokenOf(url)

  const stream = (given) => request(new URL(`/events${given === undefined ? '' : `?token=${given}`}`, url).href)
  assert.notEqual(await tokenOf(other), token)
  for (const given of [undefined, '', 'f'.repeat(48), 'é'.repeat(48), await tokenOf(other), `${token}0`]) {
    const refused = await stream(given)
    assert.deepEqual([refused.status, JSON.parse(refused.text), refused.headers['content-type'], refused.headers['cache-control'], refused.headers[CORP]], [403, { error: 'this request does not come from the panel' }, 'application/json; charset=utf-8', 'no-store', 'same-origin'])
  }
  const accepted = await request(new URL(`/events?token=${token}`, url).href, { stream: true })
  assert.deepEqual([accepted.status, accepted.headers['content-type'], accepted.headers['cache-control'], accepted.headers[CORP]], [200, 'text/event-stream', 'no-store', 'same-origin'])
})

test('the stream is for the page alone: a request a browser says comes from another site, or another origin of this one, is refused though it carries the token; the page\'s own, a navigation and a request that names no site are accepted', BOUNDED, async (t) => {
  const url = await panel(t)
  const stream = new URL(`/events?token=${await tokenOf(url)}`, url).href

  for (const site of ['cross-site', 'same-site']) {
    const refused = await request(stream, { headers: { 'sec-fetch-site': site } })
    assert.deepEqual([refused.status, JSON.parse(refused.text)], [403, { error: 'this request does not come from the panel' }])
  }
  for (const headers of [{ 'sec-fetch-site': 'same-origin' }, { 'sec-fetch-site': 'none' }, {}]) {
    const accepted = await request(stream, { headers, stream: true })
    assert.deepEqual([accepted.status, accepted.headers['content-type']], [200, 'text/event-stream'])
  }
})

test('the panel listens on the IPv4 loopback address only', BOUNDED, async (t) => {
  const url = await panel(t)
  const { port, host } = new URL(url)

  await assert.rejects(request(`http://[::1]:${port}/`, { headers: { host }, signal: t.signal }))
})

test('a request that does not name the panel\'s loopback address as its Host is refused, and an unknown path finds nothing: the page takes no answer', BOUNDED, async (t) => {
  const url = await panel(t)
  const token = await tokenOf(url)

  for (const host of ['localhost', 'evil.example', `localhost:${new URL(url).port}`]) {
    const refused = await request(new URL(`/events?token=${token}`, url).href, { headers: { host } })
    assert.deepEqual([refused.status, JSON.parse(refused.text), refused.headers[CORP]], [421, { error: 'this panel answers only on its loopback address' }, 'same-origin'])
  }
  for (const [path, method] of [['/index.html', 'GET'], ['/../index.html', 'GET'], ['/', 'POST'], ['/events', 'POST'], ['/app.mjs', 'GET'], ['/answer', 'POST']]) {
    const missing = await request(new URL(path, url).href, { method, headers: { 'x-skraft-token': token, origin: new URL(url).origin, 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify({ key: 'adr-1', answer: 'RATIFIED' }) : undefined })
    assert.deepEqual([missing.status, JSON.parse(missing.text), missing.headers[CORP]], [404, { error: 'nothing here' }, 'same-origin'])
  }
})
