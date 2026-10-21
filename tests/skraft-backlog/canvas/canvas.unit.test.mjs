// The backlog canvas as the Copilot SDK sees it, built from a fake createCanvas and CanvasError:
// the agent gets only its own actions, errors come back as canvas errors, and the loopback server
// lives while a panel is open.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { CANVAS_ID, backlogCanvas } from '../../../plugins/skraft-backlog/prd-backlog/canvas/canvas.mjs'
import { fakeGitHub } from '../prd-backlog/fake-github.mjs'
import { storyMap } from '../prd-backlog/fixtures/backlog-data.mjs'
import { SLUG, makeWorkspace, writeJson } from './workspace.mjs'
import { backlogDir } from '../../../plugins/skraft-backlog/prd-backlog/canvas/store.mjs'

class FakeCanvasError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const setUp = async (t, { workspace = true } = {}) => {
  const cwd = await mkdtemp(join(tmpdir(), 'skraft-canvas-sdk-'))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  if (workspace) await makeWorkspace(cwd)
  const logs = []
  const { canvas, controller } = backlogCanvas({ createCanvas: (options) => options, CanvasError: FakeCanvasError, cwd, gh: fakeGitHub().run, log: (text) => logs.push(text) })
  const opened = new Set()
  const open = (instanceId, input) => {
    opened.add(instanceId)
    return canvas.open({ instanceId, input })
  }
  const close = async (instanceId) => {
    opened.delete(instanceId)
    await canvas.onClose({ instanceId })
  }
  t.after(async () => {
    for (const id of [...opened]) await close(id)
    await canvas.onClose({ instanceId: 'cleanup' })
  })
  const action = (name) => canvas.actions.find((a) => a.name === name)
  return { cwd, canvas, controller, open, close, action, logs }
}

test('the canvas is declared with its id, its input and only the actions the agent may run', async (t) => {
  const { canvas } = await setUp(t)
  assert.equal(CANVAS_ID, 'skraft-backlog')
  assert.equal(canvas.id, CANVAS_ID)
  assert.equal(canvas.displayName, 'skraft backlog')
  assert.match(canvas.description, /INVEST/)
  assert.deepEqual(Object.keys(canvas.inputSchema.properties), ['slug', 'story'])
  assert.equal(canvas.inputSchema.additionalProperties, false)
  assert.deepEqual(canvas.actions.map((a) => a.name), ['get_state', 'open_backlog', 'focus_story', 'explain_story', 'list_corrections', 'get_correction_session', 'preview_creation'])
  for (const name of ['set_repo', 'mark_reviewed', 'decide_correction', 'answer_question', 'create_issues']) assert.ok(!canvas.actions.some((a) => a.name === name), `${name} stays with the human`)
  for (const action of canvas.actions) {
    assert.equal(typeof action.handler, 'function')
    assert.equal(action.inputSchema.type, 'object')
    assert.ok(action.description)
  }
})

test('opening the canvas starts one server and shows the backlog with its review count', async (t) => {
  const { open, controller } = await setUp(t)
  const first = await open('panel-1')
  assert.equal(first.title, `Backlog · ${SLUG}`)
  assert.equal(first.status, '0/2 reviewed · 0 published')
  assert.match(first.url, /^http:\/\/127\.0\.0\.1:\d+\/$/)
  const page = await fetch(first.url)
  assert.equal(page.status, 200)
  const second = await open('panel-2')
  assert.equal(second.url, first.url, 'every panel shares the server')
  assert.equal(controller.state.slug, SLUG)
})

test('opening the canvas honours the backlog and the story it is asked for', async (t) => {
  const { cwd, open, controller } = await setUp(t)
  const other = storyMap()
  other.epics = other.epics.slice(1)
  await writeJson(join(backlogDir(cwd, 'autre-prd'), 'story-map.json'), other)
  const answer = await open('panel-1', { slug: 'autre-prd', story: 'EP-002-S01' })
  assert.equal(answer.title, 'Backlog · autre-prd')
  assert.equal(answer.status, '0/0 reviewed · 0 published')
  assert.equal(controller.state.focus, 'EP-002-S01')
})

test('opening the canvas on an unknown story is an invalid request', async (t) => {
  const { open } = await setUp(t)
  await assert.rejects(open('panel-1', { story: 'EP-404-S01' }), (error) => {
    assert.ok(error instanceof FakeCanvasError)
    assert.equal(error.code, 'skraft_backlog_invalid_request')
    assert.match(error.message, /unknown stories: EP-404-S01/)
    return true
  })
})

test('without a backlog the canvas opens empty', async (t) => {
  const { open } = await setUp(t, { workspace: false })
  const answer = await open('panel-1')
  assert.equal(answer.title, 'Backlog')
  assert.equal(answer.status, 'No backlog yet')
})

test('an action of the agent answers its result; a refusal and a crash come back as canvas errors', async (t) => {
  const { action, controller } = await setUp(t)
  const state = await action('get_state').handler({ input: {} })
  assert.equal(state.slug, SLUG)
  assert.equal((await action('get_state').handler({})).slug, SLUG, 'no input reads as an empty one')
  assert.deepEqual(await action('focus_story').handler({ input: { id: 'EP-001-S01' } }), { focus: 'EP-001-S01' })
  await assert.rejects(action('explain_story').handler({ input: { id: 'nope' } }), (error) => {
    assert.ok(error instanceof FakeCanvasError)
    assert.deepEqual([error.code, error.message], ['skraft_backlog_invalid_request', 'unknown stories: nope'])
    return true
  })
  const explain = controller.actions.find((a) => a.name === 'explain_story')
  const original = explain.run
  explain.run = async () => { throw new RangeError('the disk is gone') }
  await assert.rejects(action('explain_story').handler({ input: { id: 'EP-001-S01' } }), (error) => {
    assert.deepEqual([error.code, error.message], ['skraft_backlog_error', 'the disk is gone'])
    return true
  })
  const already = new FakeCanvasError('custom', 'kept as is')
  explain.run = async () => { throw already }
  await assert.rejects(action('explain_story').handler({ input: {} }), (error) => error === already)
  explain.run = async () => { throw 'a string' }
  await assert.rejects(action('explain_story').handler({ input: {} }), (error) => error.code === 'skraft_backlog_error' && error.message === 'a string')
  explain.run = async () => undefined
  assert.deepEqual(await action('explain_story').handler({ input: {} }), { ok: true })
  explain.run = original
})

test('a panel action that crashes is answered 500 and logged to the host; a refused one is not logged', async (t) => {
  const { open, controller, logs } = await setUp(t)
  const { url } = await open('panel-1')
  const token = /<meta name="canvas-token" content="([0-9a-f]+)">/.exec(await (await fetch(url)).text())?.[1]
  assert.ok(token, 'the page carries the token')
  const post = (action, body) => fetch(new URL(`/api/${action}`, url), { method: 'POST', headers: { 'X-Canvas-Token': token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const refused = await post('mark_reviewed', { ids: ['EP-001-S02'] })
  assert.equal(refused.status, 400)
  assert.deepEqual(logs, [])
  const getState = /** @type {any} */ (controller.actions.find((a) => a.name === 'get_state'))
  getState.run = async () => { throw new Error('the disk is gone') }
  const crashed = await post('get_state', {})
  assert.equal(crashed.status, 500)
  assert.deepEqual(await crashed.json(), { error: 'the disk is gone' })
  assert.deepEqual(logs, ['canvas: the disk is gone'])
})

test('the server stops when the last panel closes, and starts again on the next open', async (t) => {
  const { open, close, controller } = await setUp(t)
  const { url } = await open('panel-1')
  await open('panel-2')
  await close('panel-1')
  assert.equal((await fetch(url)).status, 200, 'a panel is still open')
  await close('panel-2')
  await assert.rejects(fetch(url))
  await close('panel-2')
  const again = await open('panel-3')
  assert.equal((await fetch(again.url)).status, 200)
  assert.equal(controller.state.slug, SLUG)
})

test('a panel whose open failed does not keep the server running once the others close', { timeout: 10000 }, async (t) => {
  const { open, close, canvas } = await setUp(t)
  const { url } = await open('panel-1')
  await assert.rejects(canvas.open({ instanceId: 'panel-2', input: { story: 'EP-404-S01' } }))
  await close('panel-1')
  await assert.rejects(fetch(url))
})
