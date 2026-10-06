// Integration — the Copilot app canvas (src/adapters/api/copilot-canvas/): the canvas
// options the extension hands to createCanvas, opened on a real tracking directory, served
// by a real local server, read and answered over real HTTP and server-sent events.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSkraftPipelineCanvas, CanvasRequestError } from '../../../plugins/skraft-framework/src/adapters/api/copilot-canvas/skraft-pipeline-canvas.mjs'
import { askPrompt, isAuthorized } from '../../../plugins/skraft-framework/src/adapters/api/copilot-canvas/canvas-server.mjs'
import { PLUGIN_ROOT, review } from './fake-host.mjs'

const SLUG = 'checkout'
const TODAY = '2026-10-06'

const withProject = async (fn) => {
  const repo = await mkdtemp(join(tmpdir(), 'skraft-canvas-'))
  const tracking = join(repo, '.copilot-tracking/skraft-plans', SLUG)
  await mkdir(join(tracking, 'reviews', TODAY), { recursive: true })
  await writeFile(join(tracking, 'state.json'), JSON.stringify({
    currentPhase: 'DESIGN', phasesCompleted: ['RESEARCH'], verdicts: { RESEARCH: 'APPROVED', DESIGN: 'CHANGES_REQUESTED' },
    retryCount: {}, phaseArtifacts: { DESIGN: [`details/${TODAY}/design.md`] }, reviewArtifacts: { DESIGN: [`reviews/${TODAY}/design-review-1.md`] },
    phaseHistory: { DESIGN: { startedAt: `${TODAY}T09:00:00.000Z`, baseSha: 'a'.repeat(40) } }, userPreferences: { maxRetriesPerPhase: 2 },
  }))
  await writeFile(join(tracking, 'reviews', TODAY, 'design-review-1.md'), review('REJECTED', { findings: 'G13: decision drift' }))
  const journal = (status) => JSON.stringify({
    status, phase: 'DESIGN', reason: 'Rejected', story: { issue: 42, title: 'Pay by card' },
    checkpoint: status === 'awaiting-human' ? { key: 'rejected:DESIGN:1', question: 'DESIGN was rejected. Rework?', options: ['rework', 'stop'] } : null,
    startedAt: `${TODAY}T09:00:00.000Z`, updatedAt: `${TODAY}T09:10:00.000Z`, log: [{ at: `${TODAY}T09:10:00.000Z`, message: 'waiting' }],
  })
  await writeFile(join(tracking, 'run.json'), journal('awaiting-human'))
  const prompts = []
  const canvas = createSkraftPipelineCanvas({
    cwd: () => repo, pluginRoot: PLUGIN_ROOT, env: { ...process.env, SKRAFT_TRACKING_ROOT: '' }, pollMs: 40,
    sendPrompt: async (prompt) => { prompts.push(prompt) },
  })
  try {
    await fn({ repo, tracking, canvas, prompts, journal })
  } finally {
    await canvas.onClose({ instanceId: 'i-1' })
    await rm(repo, { recursive: true, force: true })
  }
}

const open = (canvas, repo, input = { slug: SLUG }) => canvas.open({ instanceId: 'i-1', canvasId: 'skraft-pipeline', input, session: { workingDirectory: repo } })
const tokenOf = (url) => new URL(url).searchParams.get('token')
const api = (url, path, init = {}) => fetch(new URL(path, url), { ...init, headers: { 'x-skraft-token': tokenOf(url), 'Content-Type': 'application/json', ...init.headers } })

// One server-sent event of a type, read off a live stream.
const nextEvent = async (reader, type) => {
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) throw new Error('stream closed')
    buffer += decoder.decode(value, { stream: true })
    for (const block of buffer.split('\n\n').slice(0, -1)) {
      const event = /^event: (.+)$/m.exec(block)?.[1]
      const data = /^data: (.+)$/m.exec(block)?.[1]
      if (event === type) return JSON.parse(data)
    }
    buffer = buffer.slice(buffer.lastIndexOf('\n\n') + 2)
  }
}

test('canvas: declared for createCanvas with its actions; opening needs a pipeline to show', async () => {
  await withProject(async ({ repo, canvas }) => {
    assert.equal(canvas.id, 'skraft-pipeline')
    assert.deepEqual(canvas.actions.map((a) => a.name), ['get_pipeline', 'decide', 'show_phase', 'refresh'])
    await assert.rejects(open(canvas, repo, {}), (error) => error instanceof CanvasRequestError && error.code === 'pipeline_unknown')
    await assert.rejects(open(canvas, repo, { slug: '../x' }), { code: 'pipeline_unknown' })
    await assert.rejects(canvas.actions[0].handler({ instanceId: 'nope' }), { code: 'canvas_not_open' })
  })
})

test('canvas: opens on a local page that only its token reads, and shows the pipeline', async () => {
  await withProject(async ({ repo, canvas }) => {
    const opened = await open(canvas, repo)
    assert.match(opened.url, /^http:\/\/127\.0\.0\.1:\d+\/\?token=[0-9a-f]{48}&slug=checkout$/)
    assert.equal(opened.title, 'Skraft · checkout')
    assert.equal(opened.status, 'DESIGN · awaiting-human')

    const page = await fetch(opened.url)
    assert.equal(page.status, 200)
    assert.match(page.headers.get('content-security-policy'), /default-src 'self'/)
    assert.match(await page.text(), /<title>Skraft pipeline<\/title>/)
    assert.equal((await fetch(new URL('/api/view', opened.url))).status, 403, 'no token')
    assert.equal((await fetch(new URL('/api/view', opened.url), { headers: { 'x-skraft-token': 'f'.repeat(48) } })).status, 403, 'wrong token')

    const view = await (await api(opened.url, '/api/view')).json()
    assert.equal(view.slug, SLUG)
    assert.deepEqual(view.phases.map((p) => p.status), ['done', 'awaiting', 'pending', 'pending'])
    assert.deepEqual(view.checkpoint, { key: 'rejected:DESIGN:1', question: 'DESIGN was rejected. Rework?', options: ['rework', 'stop'], answered: false })
    assert.deepEqual(view.phases[1].steps.map((s) => `${s.id}:${s.status}`), ['structural-scan:pending', 'outputs:done', 'review:failed', 'adr-ratification:pending', 'closed:waiting'])
    assert.deepEqual([view.tests.evidenceLog, view.cost.total.dispatches], [null, 0])

    assert.match(await (await api(opened.url, `/api/file?path=reviews/${TODAY}/design-review-1.md`)).text(), /G13: decision drift/)
    assert.equal((await api(opened.url, '/api/file?path=state.json')).status, 404)
    assert.equal((await api(opened.url, '/api/file?path=../../../etc/passwd')).status, 404)

    const again = await open(canvas, repo)
    assert.equal(again.url, opened.url, 're-opening the instance focuses the same page')
  })
})

test('canvas: an answer given on the page is recorded for the pipeline and shown answered', async () => {
  await withProject(async ({ repo, tracking, canvas }) => {
    const { url } = await open(canvas, repo)
    const refused = await api(url, '/api/decide', { method: 'POST', body: JSON.stringify({ key: 'rejected:DESIGN:1', answer: '  ' }) })
    assert.equal(refused.status, 400)
    const recorded = await api(url, '/api/decide', { method: 'POST', body: JSON.stringify({ key: 'rejected:DESIGN:1', answer: 'rework' }) })
    assert.equal(recorded.status, 200)
    const decision = JSON.parse(await readFile(join(tracking, 'decisions', 'rejected_DESIGN_1.json'), 'utf8'))
    assert.deepEqual([decision.key, decision.answer, decision.by], ['rejected:DESIGN:1', 'rework', 'human'])
    const view = await (await api(url, '/api/view')).json()
    assert.equal(view.checkpoint.answered, true)
  })
})

test('canvas: the page follows the run live, and the agent reads, answers, scrolls and refreshes through the actions', async () => {
  await withProject(async ({ repo, tracking, canvas, journal }) => {
    const { url } = await open(canvas, repo)
    const stream = await fetch(new URL(`/api/events?token=${tokenOf(url)}`, url))
    assert.equal(stream.headers.get('content-type'), 'text/event-stream')
    const reader = stream.body.getReader()
    assert.equal((await nextEvent(reader, 'view')).run.status, 'awaiting-human')

    await writeFile(join(tracking, 'run.json'), journal('running'))
    assert.equal((await nextEvent(reader, 'view')).run.status, 'running', 'a change on disk reaches the page')

    const [getPipeline, decide, showPhase, refresh] = canvas.actions
    const ctx = (input) => ({ instanceId: 'i-1', input })
    assert.equal((await getPipeline.handler(ctx({}))).currentPhase, 'DESIGN')
    await assert.rejects(decide.handler(ctx({ key: 'rejected:DESIGN:1' })), { code: 'decision_refused' })
    assert.deepEqual(await decide.handler(ctx({ key: 'rejected:DESIGN:1', answer: 'stop' })), { recorded: 'rejected:DESIGN:1' })
    await showPhase.handler(ctx({ phase: 'DELIVER' }))
    assert.deepEqual(await nextEvent(reader, 'focus'), { phase: 'DELIVER' })
    assert.deepEqual(await refresh.handler(ctx({})), { status: 'DESIGN · running' })
    await reader.cancel()
  })
})

test('canvas: the page reaches the chat only through fixed prompts', async () => {
  await withProject(async ({ repo, canvas, prompts }) => {
    const { url } = await open(canvas, repo)
    assert.equal((await api(url, '/api/ask', { method: 'POST', body: JSON.stringify({ intent: 'resume' }) })).status, 200)
    assert.equal((await api(url, '/api/ask', { method: 'POST', body: JSON.stringify({ intent: 'rm -rf /' }) })).status, 400)
    assert.deepEqual(prompts, [askPrompt('resume', SLUG)])
    assert.match(prompts[0], /^Resume the skraft-pipeline dynamic workflow for slug "checkout"/)
  })
})

test('canvas: closing the instance stops its server', async () => {
  await withProject(async ({ repo, canvas }) => {
    const { url } = await open(canvas, repo)
    await canvas.onClose({ instanceId: 'i-1' })
    await assert.rejects(fetch(url))
  })
})

test('canvas server: a request for another host, another origin or a cross-site fetch is refused', () => {
  const entry = { host: '127.0.0.1:5000', origin: 'http://127.0.0.1:5000', token: 't' }
  const url = new URL('http://127.0.0.1:5000/api/view')
  const req = (headers) => ({ headers: { host: '127.0.0.1:5000', 'x-skraft-token': 't', ...headers } })
  assert.equal(isAuthorized(req({}), url, entry), true)
  assert.equal(isAuthorized(req({ host: 'evil.test' }), url, entry), false, 'DNS rebinding')
  assert.equal(isAuthorized(req({ origin: 'https://evil.test' }), url, entry), false)
  assert.equal(isAuthorized(req({ origin: 'null' }), url, entry), false)
  assert.equal(isAuthorized(req({ 'sec-fetch-site': 'cross-site' }), url, entry), false)
  assert.equal(isAuthorized(req({ 'x-skraft-token': undefined }), new URL('http://127.0.0.1:5000/api/events?token=t'), entry), true, 'EventSource sends the token in the query')
})
