import { test } from 'node:test'
import assert from 'node:assert/strict'
import { workingCopy } from '../copilot-workflow/simulated-host.mjs'
import { CanvasError, pipelineCanvas, request } from './canvas-host.mjs'

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

test('at most four panels are open at once; a fifth is refused until one closes', async (t) => {
  const { open, canvas } = await canvasOn(t)
  for (const instanceId of ['a', 'b', 'c', 'd']) await open(instanceId)

  await assert.rejects(open('e'), (error) => error instanceof CanvasError && error.code === 'skraft_too_many_canvases' && error.message === 'too many skraft-pipeline canvases are open; close one first')
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
