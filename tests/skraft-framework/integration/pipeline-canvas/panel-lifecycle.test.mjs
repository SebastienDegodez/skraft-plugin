import { test } from 'node:test'
import assert from 'node:assert/strict'
import { workingCopy } from '../copilot-workflow/simulated-host.mjs'
import { CanvasError, contentStream, pipelineCanvas, request, tokenOf } from './canvas-host.mjs'

const INVALID_INPUT = { name: 'Error', code: 'skraft_invalid_input', message: 'the skraft-pipeline canvas takes no input; it shows the active pipeline of this working copy' }

const canvasOn = async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  return pipelineCanvas(t, { directory: () => cwd, home: `${cwd}-home` })
}

test('the canvas declares itself, with one read-only action, and starts nothing until it is opened', async (t) => {
  const { canvas } = await canvasOn(t)

  assert.deepEqual({ ...canvas, actions: canvas.actions.map(({ handler, ...declared }) => declared), open: typeof canvas.open, onClose: typeof canvas.onClose }, {
    id: 'skraft-pipeline',
    displayName: 'skraft pipeline',
    description: canvas.description,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    actions: [{ name: 'get_pipeline', description: canvas.actions[0].description, inputSchema: { type: 'object', properties: {}, additionalProperties: false } }],
    open: 'function',
    onClose: 'function',
  })
})

test('opening an open instance again gives the same panel; closing it stops its server; opening it again starts a new one', async (t) => {
  const { open, canvas } = await canvasOn(t)

  const first = await open('panel-1')
  assert.equal((await open('panel-1')).url, first.url)
  await canvas.onClose({ instanceId: 'panel-1' })
  await assert.rejects(request(first.url))
  const again = await open('panel-1')

  assert.notEqual(again.url, first.url)
  assert.equal((await request(again.url)).status, 200)
  await canvas.onClose({ instanceId: 'never-opened' })
})

/** A page listening to each of these panels. */
const listening = async (t, panels) => {
  for (const { url } of panels) await contentStream(t, url, await tokenOf(url)).next()
}

const TOO_MANY = (error) => error instanceof CanvasError && error.code === 'skraft_too_many_canvases' && error.message === 'too many skraft-pipeline canvases are open; close one first'

test('with four panels open, a fifth closes the oldest panel no page listens to, and keeps those a page listens to', async (t) => {
  const { open } = await canvasOn(t)
  const [a, b, c, d] = [await open('a'), await open('b'), await open('c'), await open('d')]
  await listening(t, [a, c])

  const e = await open('e')

  await assert.rejects(request(b.url))
  assert.deepEqual(await Promise.all([a, c, d, e].map(async ({ url }) => (await request(url)).status)), [200, 200, 200, 200])
  assert.equal((await open('b')).url === b.url, false)
})

test('with a page listening to each of four panels, a fifth is refused until one closes; opening an open one is no fifth', async (t) => {
  const { open, canvas } = await canvasOn(t)
  const panels = [await open('a'), await open('b'), await open('c'), await open('d')]
  await listening(t, panels)

  await assert.rejects(open('e'), TOO_MANY)
  assert.equal((await open('d')).status, 'idle')
  await canvas.onClose({ instanceId: 'b' })

  assert.equal((await request((await open('e')).url)).status, 200)
})

test('the canvas and its action take no input: a slug, any other key, or a value that is no object is refused, and nothing opens', async (t) => {
  const { open, shown } = await canvasOn(t)

  for (const input of [{ slug: 'checkout' }, { anything: true }, 'checkout', ['checkout'], 3]) {
    await assert.rejects(open('panel-1', input), (error) => error instanceof CanvasError && error.code === INVALID_INPUT.code && error.message === INVALID_INPUT.message)
    await assert.rejects(shown(input), (error) => error instanceof CanvasError && error.code === INVALID_INPUT.code)
  }
  assert.equal((await open('panel-1', null)).status, 'idle')
  assert.equal((await open('panel-1', undefined)).status, 'idle')
  assert.equal((await shown(undefined)).status, 'idle')
})
