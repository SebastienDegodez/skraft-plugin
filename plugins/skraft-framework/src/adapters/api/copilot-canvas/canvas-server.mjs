import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Driving adapter: the local web server behind one open instance of the Copilot app
// canvas. The app renders a canvas from the URL its provider returns, so each instance
// serves its page on 127.0.0.1, on a port the OS picks, and answers HTTP by calling the
// use cases — ObservePipeline (read) and RecordDecision (write). It takes no decision.
//
//   GET  /                  the page (public, no data)       GET /app.js, /styles.css
//   GET  /api/view          the pipeline view                 token
//   GET  /api/events        server-sent events: view, focus   token
//   GET  /api/file?path=    a review, report or decision      token
//   POST /api/decide        { key, answer } → RecordDecision  token
//   POST /api/ask           { intent: resume | explain }      token
//
// Every /api call must carry the instance token (header x-skraft-token, or ?token= for
// EventSource, which sends no header), come for the bound host, and be same-origin.
// The page reaches the chat only through fixed prompts; it never sends free text.
//
// The pipeline shown is the working copy's active one (.active-slug), read again on every
// refresh: a run started in this worktree shows up by itself. No pointer: /api/view
// answers { idle: true, reason, where } and the page says so; nothing else is guessed.

const ASSETS = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
})
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'"
const BODY_LIMIT = 16 * 1024
const DEFAULT_POLL_MS = 1500

export const askPrompt = (intent, slug) => (slug ? {
  resume: `Resume the skraft-pipeline dynamic workflow for slug "${slug}": continue the paused run if there is one, otherwise start it again with { "slug": "${slug}" }.`,
  explain: `Read the Skraft pipeline canvas for slug "${slug}" (get_pipeline action) and explain in a few sentences where the pipeline stands, what it waits for, and the next step. Change nothing.`,
} : {})[intent] ?? null

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

const readBody = async (req) => {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > BODY_LIMIT) throw new Error('request body too large')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export const isAuthorized = (req, url, { host, origin, token }) => {
  if (req.headers.host !== host) return false
  const requestOrigin = req.headers.origin
  if (requestOrigin !== undefined && requestOrigin !== origin) return false
  const site = req.headers['sec-fetch-site']
  if (site && site !== 'same-origin' && site !== 'none') return false
  return (req.headers['x-skraft-token'] ?? url.searchParams.get('token')) === token
}

// observe — ObservePipeline; recordDecision — RecordDecision; sendPrompt(prompt) → the chat;
// activeSlug() → Ok(slug) | Err({ reason }) — the working copy's pipeline (.active-slug);
// where — the working copy, shown while no pipeline is active.
export const startCanvasServer = async ({ activeSlug, where = '', observe, recordDecision, sendPrompt, publicDir, pollMs = DEFAULT_POLL_MS }) => {
  const token = randomBytes(24).toString('hex')
  let slug = null
  const clients = new Set()
  let last = ''
  let timer = null
  const entry = { host: '', origin: '', token }

  const emit = (event, data) => {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    for (const client of clients) {
      try { client.write(payload) } catch { clients.delete(client) }
    }
  }
  // The active pipeline's view, or the idle view while the working copy has none.
  const viewNow = async () => {
    const active = await activeSlug()
    slug = active.ok ? active.value : null
    return slug ? observe.snapshot(slug) : { idle: true, reason: active.error.reason, where }
  }
  const publish = async (force = false) => {
    const view = await viewNow()
    const text = JSON.stringify(view)
    if (force || text !== last) {
      last = text
      emit('view', view)
    }
    return view
  }
  const watch = () => {
    if (timer || clients.size === 0) return
    timer = setInterval(() => { publish().catch(() => {}) }, pollMs)
    timer.unref?.()
  }
  const unwatch = () => {
    if (clients.size > 0 || !timer) return
    clearInterval(timer)
    timer = null
  }

  const api = async (req, res, url) => {
    if (req.method === 'GET' && url.pathname === '/api/view') return send(res, 200, await viewNow())
    if (req.method === 'GET' && url.pathname === '/api/file') {
      const text = slug ? await observe.readTracked(slug, url.searchParams.get('path')) : null
      return text === null ? send(res, 404, { error: 'not a file of this pipeline' }) : send(res, 200, text, 'text/plain; charset=utf-8')
    }
    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
      res.write(': skraft\n\n')
      clients.add(res)
      req.on('close', () => { clients.delete(res); unwatch() })
      watch()
      const view = await viewNow()
      last = JSON.stringify(view)
      res.write(`event: view\ndata: ${last}\n\n`)
      return undefined
    }
    if (req.method === 'POST' && url.pathname === '/api/decide') {
      await viewNow()
      if (!slug) return send(res, 409, { error: 'no pipeline is active in this working copy' })
      const { key, answer } = await readBody(req)
      const recorded = await recordDecision.record({ slug, key, answer, by: 'human' })
      if (!recorded.ok) return send(res, 400, { error: recorded.error.reason })
      await publish(true)
      return send(res, 200, { recorded: key })
    }
    if (req.method === 'POST' && url.pathname === '/api/ask') {
      await viewNow()
      const prompt = askPrompt((await readBody(req)).intent, slug)
      if (!prompt) return send(res, 400, { error: 'unknown intent' })
      await sendPrompt(prompt)
      return send(res, 200, { sent: true })
    }
    return send(res, 404, { error: 'not found' })
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${entry.host}`)
      if (url.pathname.startsWith('/api/')) {
        if (!isAuthorized(req, url, entry)) return send(res, 403, { error: 'forbidden' })
        return await api(req, res, url)
      }
      const asset = req.method === 'GET' ? ASSETS[url.pathname] : undefined
      if (!asset || req.headers.host !== entry.host) return send(res, 404, { error: 'not found' })
      const body = await readFile(join(publicDir, asset[0]))
      res.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-store', 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff' })
      return res.end(body)
    } catch (error) {
      if (!res.headersSent) send(res, 500, { error: String(error?.message ?? error) })
      return undefined
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  entry.host = `127.0.0.1:${port}`
  entry.origin = `http://${entry.host}`

  return Object.freeze({
    url: `${entry.origin}/?token=${token}`,
    refresh: () => publish(true),
    focus: (phase) => emit('focus', { phase }),
    close: () => new Promise((resolve) => {
      if (timer) clearInterval(timer)
      for (const client of clients) client.end()
      clients.clear()
      server.close(() => resolve())
      server.closeAllConnections?.()
    }),
  })
}
