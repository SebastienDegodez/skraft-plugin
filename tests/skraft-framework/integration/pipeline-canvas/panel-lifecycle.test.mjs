import { test } from 'node:test'
import assert from 'node:assert/strict'
import { workingCopy } from '../copilot-workflow/simulated-host.mjs'
import { BOUNDED, CanvasError, contentStream, pageLeft, pipelineCanvas, rawConnection, request, tokenOf, within } from './canvas-host.mjs'

const INVALID_INPUT = { name: 'Error', code: 'skraft_invalid_input', message: 'the skraft-pipeline canvas takes only tab, one of run, configuration and workflow; it shows the active pipeline of this working copy' }

const canvasOn = async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  return pipelineCanvas(t, { directory: () => cwd, home: `${cwd}-home` })
}

test('the canvas declares itself, opened on one of its tabs, with two read-only actions, and starts nothing until it is opened', BOUNDED, async (t) => {
  const { canvas } = await canvasOn(t)

  assert.deepEqual({ ...canvas, actions: canvas.actions.map(({ handler, ...declared }) => declared), open: typeof canvas.open, onClose: typeof canvas.onClose }, {
    id: 'skraft-pipeline',
    displayName: 'skraft pipeline',
    description: canvas.description,
    inputSchema: { type: 'object', properties: { tab: { type: 'string', enum: ['run', 'configuration', 'workflow'] } }, additionalProperties: false },
    actions: ['get_pipeline', 'get_configuration'].map((name, index) => ({ name, description: canvas.actions[index].description, inputSchema: { type: 'object', properties: {}, additionalProperties: false } })),
    open: 'function',
    onClose: 'function',
  })
})

test('opening an open instance again gives the same panel; closing it stops its server; opening it again starts a new one', BOUNDED, async (t) => {
  const { open, canvas } = await canvasOn(t)

  const first = await open('panel-1')
  assert.equal((await open('panel-1')).url, first.url)
  await canvas.onClose({ instanceId: 'panel-1' })
  await assert.rejects(request(first.url, { signal: t.signal }))
  const again = await open('panel-1')

  assert.notEqual(again.url, first.url)
  assert.equal((await request(again.url)).status, 200)
  await canvas.onClose({ instanceId: 'never-opened' })
})

test('closing a panel ends at once, though a connection that sent no request and a listening page are open, and drops both', BOUNDED, async (t) => {
  const { open, canvas } = await canvasOn(t)
  const { url } = await open('panel-1')
  const stream = contentStream(t, url, await tokenOf(url))
  await stream.next()
  const idle = await rawConnection(t, url)
  assert.equal((await request(url)).status, 200)

  assert.equal(await within(t, 5000, canvas.onClose({ instanceId: 'panel-1' }).then(() => 'closed')), 'closed')
  assert.equal(await within(t, 5000, idle.closed), 'closed')
  await assert.rejects(request(url, { signal: t.signal }))
})

/** A page listening to each of these panels. */
const listening = async (t, panels) => {
  for (const { url } of panels) await contentStream(t, url, await tokenOf(url)).next()
}

const TOO_MANY = (error) => error instanceof CanvasError && error.code === 'skraft_too_many_canvases' && error.message === 'too many skraft-pipeline canvases are open; close one first'

test('with four panels open, a fifth closes the oldest panel whose page left, and keeps the panels a page listens to and a panel no page has reached yet', BOUNDED, async (t) => {
  const { open } = await canvasOn(t)
  const [a, b, c, d] = [await open('a'), await open('b'), await open('c'), await open('d')]
  const streams = []
  for (const { url } of [b, c, d]) streams.push(contentStream(t, url, await tokenOf(url)))
  for (const stream of streams) await stream.next()
  await streams[2].close()

  const e = await pageLeft(t, open, 'e')

  await assert.rejects(request(d.url, { signal: t.signal }))
  assert.deepEqual(await Promise.all([a, b, c, e].map(async ({ url }) => (await request(url)).status)), [200, 200, 200, 200])
  assert.equal((await open('d')).url === d.url, false)
})

test('a panel no page has reached yet is not closed for a fifth: with a page on each of the three others, the fifth is refused', BOUNDED, async (t) => {
  const { open } = await canvasOn(t)
  const [a, b, c, d] = [await open('a'), await open('b'), await open('c'), await open('d')]
  await listening(t, [a, b, c])

  await assert.rejects(open('e'), TOO_MANY)

  assert.equal((await request(d.url)).status, 200)
})

test('with a page listening to each of four panels, a fifth is refused until one closes; opening an open one is no fifth', BOUNDED, async (t) => {
  const { open, canvas } = await canvasOn(t)
  const panels = [await open('a'), await open('b'), await open('c'), await open('d')]
  await listening(t, panels)

  await assert.rejects(open('e'), TOO_MANY)
  assert.equal((await open('d')).status, 'idle')
  await canvas.onClose({ instanceId: 'b' })

  assert.equal((await request((await open('e')).url)).status, 200)
})

test('the canvas takes no input but its tab, and its actions none: a slug, any other key, or a value that is no object is refused, and nothing opens', BOUNDED, async (t) => {
  const { open, shown } = await canvasOn(t)

  for (const input of [{ slug: 'checkout' }, { anything: true }, 'checkout', ['checkout'], 3]) {
    await assert.rejects(open('panel-1', input), (error) => error instanceof CanvasError && error.code === INVALID_INPUT.code && error.message === INVALID_INPUT.message)
    await assert.rejects(shown(input), (error) => error instanceof CanvasError && error.code === INVALID_INPUT.code)
  }
  await assert.rejects(shown({ tab: 'run' }), (error) => error instanceof CanvasError && error.code === INVALID_INPUT.code)
  assert.equal((await open('panel-1', null)).status, 'idle')
  assert.equal((await open('panel-1', undefined)).status, 'idle')
  assert.equal((await shown(undefined)).status, 'idle')
})
