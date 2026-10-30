import { test } from 'node:test'
import assert from 'node:assert/strict'
import { workingCopy } from '../copilot-workflow/simulated-host.mjs'
import { BOUNDED, contentStream, pipelineCanvas, tokenOf } from './canvas-host.mjs'

const canvasOn = async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  return pipelineCanvas(t, { directory: () => cwd, home: `${cwd}-home`, more: { pollMs: 60_000 } })
}

const isFocus = (frame) => frame.event === 'focus'

test('a page already open is moved, through its stream, to the tab the canvas is opened on again; reopened without a tab, it is not moved; the url still names the tab', BOUNDED, async (t) => {
  const { open } = await canvasOn(t)
  const { url } = await open('panel-1')
  const stream = contentStream(t, url, await tokenOf(url))
  await stream.next()

  const again = await open('panel-1', { tab: 'configuration' })
  assert.equal(again.url, `${url}&tab=configuration`)
  assert.deepEqual(await stream.frame(isFocus), { event: 'focus', data: '{"tab":"configuration"}' })

  await open('panel-1')
  await open('panel-1', { tab: 'workflow' })
  assert.equal((await stream.frame(isFocus))?.data, '{"tab":"workflow"}')
})

test('a tab the canvas is opened on while no page listens goes to the next page that comes, once', BOUNDED, async (t) => {
  const { open } = await canvasOn(t)
  const { url } = await open('panel-1')
  const token = await tokenOf(url)
  await open('panel-1', { tab: 'workflow' })

  const first = contentStream(t, url, token)
  assert.equal((await first.frame(isFocus))?.data, '{"tab":"workflow"}')
  await first.next()
  await first.close()
  const second = contentStream(t, url, token)
  await second.next()

  assert.deepEqual(second.frames.filter(isFocus), [])
})
