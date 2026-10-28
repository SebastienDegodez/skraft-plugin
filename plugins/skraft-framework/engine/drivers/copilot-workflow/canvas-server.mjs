import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The loopback server of one open `skraft-pipeline` canvas panel, started by the canvas's
 * `open`, never at import. It serves the page, streams the panel content as server-sent events
 * while a page listens (read again every `pollMs`, sent when it changed) and takes an answer.
 * Every request names the bound loopback address as its Host (no DNS rebinding). The panel's
 * token travels only in the url `open` gives the host (`/?t=<token>`): the page, the stream and
 * the answer each need it, compared in constant time, so that neither another local process nor
 * a browser page reads the view or raises a dialog; an answer also needs the page's own Origin.
 * The person's confirmation in the host stays the gate of every answer. The page runs under
 * `default-src 'none'`. Refusals and failures are said by fixed texts.
 *
 * @typedef {{ content: () => Promise<object>, answer: (input: Record<string, unknown>) => Promise<object>, pollMs: number }} PanelHost
 *   content: what the page draws now; answer: what an answer came to.
 * @typedef {PanelHost & {
 *   token: string, origin: string, host: string, clients: Set<import('node:http').ServerResponse>,
 *   last: string | null, timer: NodeJS.Timeout | null,
 * }} Panel
 *   host: the bound loopback address, the only Host a request may name; last: the content sent last.
 * @typedef {{ panel?: Panel }} Bound the panel, once its server listens (`once` rejects when the listen fails)
 * @typedef {{ url: string, close: () => Promise<void> }} RunningPanel
 */

const UI = fileURLToPath(new URL('./canvas-ui/', import.meta.url))
const LOOPBACK = '127.0.0.1'
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'"
const MAX_BODY = 16 * 1024
const ASSETS = Object.freeze({ '/app.js': 'text/javascript; charset=utf-8', '/styles.css': 'text/css; charset=utf-8' })
const REFUSALS = Object.freeze({
  host: [421, 'this panel answers only on its loopback address'],
  forbidden: [403, 'this request does not come from the panel'],
  missing: [404, 'nothing here'],
  body: [400, 'an answer is a JSON object of at most 16 KiB'],
  failed: [500, 'skraft could not answer; run skraft status in a terminal'],
})

/** @param {PanelHost} host @returns {Promise<RunningPanel>} */
export const startPanel = async (host) => {
  const bound = /** @type {Bound} */ ({})
  const server = createServer((req, res) => { void served(/** @type {Panel} */ (bound.panel), req, res) })
  server.listen(0, LOOPBACK)
  await once(server, 'listening')
  const address = `${LOOPBACK}:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`
  const panel = { ...host, token: randomBytes(24).toString('hex'), host: address, origin: `http://${address}`, clients: new Set(), last: null, timer: null }
  bound.panel = panel
  return Object.freeze({ url: `${panel.origin}/?t=${panel.token}`, close: () => closed(panel, server) })
}

/**
 * A request, answered by its route; a failure by a fixed text, unless the route already began its
 * answer (then refusing would throw out of the server).
 * @param {Panel} panel @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res
 */
const served = async (panel, req, res) => {
  try {
    await routed(panel, req, res)
  } catch {
    res.headersSent || refuse(res, 'failed')
  }
}

/** @param {Panel} panel @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res */
const routed = (panel, req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  if (req.headers.host !== panel.host) return refuse(res, 'host')
  const url = new URL(/** @type {string} */ (req.url), panel.origin)
  const route = ROUTES[`${req.method} ${url.pathname}`]
  return route === undefined ? refuse(res, 'missing') : route(panel, req, res, url.searchParams)
}

/**
 * @typedef {(panel: Panel, req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, query: URLSearchParams) => unknown} Route
 * @type {Readonly<Record<string, Route>>}
 */
const ROUTES = Object.freeze({
  __proto__: null,
  'GET /': (panel, _req, res, query) => page(panel, res, query),
  'GET /app.js': (_panel, _req, res) => asset(res, '/app.js'),
  'GET /styles.css': (_panel, _req, res) => asset(res, '/styles.css'),
  'GET /events': (panel, req, res, query) => subscribed(panel, req, res, query),
  'POST /answer': (panel, req, res) => answered(panel, req, res),
})

/**
 * The page, at the url `open` gave only: it reads the token from its own address and never
 * carries it.
 * @param {Panel} panel @param {import('node:http').ServerResponse} res @param {URLSearchParams} query
 */
const page = async (panel, res, query) => {
  if (!isToken(panel, query.get('t'))) return refuse(res, 'forbidden')
  const html = await readFile(join(UI, 'index.html'))
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': CSP })
  res.end(html)
}

/** @param {import('node:http').ServerResponse} res @param {keyof typeof ASSETS} path */
const asset = async (res, path) => {
  const body = await readFile(join(UI, path))
  res.writeHead(200, { 'Content-Type': ASSETS[path], 'Cache-Control': 'no-store' })
  res.end(body)
}

/**
 * The content stream: now, then each time it changes while the page listens.
 * @param {Panel} panel @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res @param {URLSearchParams} query
 */
const subscribed = async (panel, req, res, query) => {
  if (!isToken(panel, query.get('token'))) return refuse(res, 'forbidden')
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' })
  panel.clients.add(res)
  res.on('close', () => left(panel, res))
  await published(panel, true)
  watched(panel)
}

/**
 * An answer from the page: its token and its own origin, then what the answer came to; the
 * stream carries the content it changed at once.
 * @param {Panel} panel @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res
 */
const answered = async (panel, req, res) => {
  if (!isToken(panel, req.headers['x-skraft-token']) || req.headers.origin !== panel.origin) return refuse(res, 'forbidden')
  const input = await bodyOf(req)
  if (input === null) return refuse(res, 'body')
  json(res, 200, await panel.answer(input))
  await published(panel, false)
}

/**
 * Whether the request gives this panel's token: their SHA-256 digests compared in constant time,
 * so that a value of any length or encoding is refused, never thrown on.
 * @param {Panel} panel @param {unknown} given
 */
const isToken = (panel, given) => typeof given === 'string' && timingSafeEqual(digest(given), digest(panel.token))

/** @param {string} text */
const digest = (text) => createHash('sha256').update(text).digest()

/**
 * Sends the content to every listening page: always when `force`, else only when it changed.
 * @param {Panel} panel @param {boolean} force
 */
const published = async (panel, force) => {
  const text = JSON.stringify(await panel.content())
  if (!force && text === panel.last) return
  panel.last = text
  for (const client of panel.clients) client.write(`data: ${text}\n\n`)
}

/** Reads the content again every pollMs while a page listens. @param {Panel} panel */
const watched = (panel) => {
  if (panel.timer !== null) return
  panel.timer = setInterval(() => { void published(panel, false).catch(() => undefined) }, panel.pollMs)
  panel.timer.unref()
}

/** @param {Panel} panel @param {import('node:http').ServerResponse} res */
const left = (panel, res) => {
  panel.clients.delete(res)
  if (panel.clients.size === 0) stopped(panel)
}

/** @param {Panel} panel */
const stopped = (panel) => {
  clearInterval(panel.timer ?? undefined)
  panel.timer = null
}

/**
 * The request's JSON object; null when it is not one or is larger than MAX_BODY. The rest of a
 * body too large is still read, so the page gets its answer instead of a reset.
 * @param {import('node:http').IncomingMessage} req @returns {Promise<Record<string, unknown> | null>}
 */
const bodyOf = async (req) => {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    // Stryker disable next-line ConditionalExpression: keeping every chunk changes nothing observable: a body past MAX_BODY is refused whatever was kept; the condition bounds memory only
    size <= MAX_BODY && chunks.push(chunk)
  }
  return size > MAX_BODY ? null : objectIn(Buffer.concat(chunks).toString('utf8'))
}

/** @param {string} text @returns {Record<string, unknown> | null} */
const objectIn = (text) => {
  try {
    const value = JSON.parse(text)
    return typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

/** @param {import('node:http').ServerResponse} res @param {keyof typeof REFUSALS} why */
const refuse = (res, why) => {
  const [status, error] = REFUSALS[why]
  json(res, status, { error })
}

/** @param {import('node:http').ServerResponse} res @param {number} status @param {unknown} body */
const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

/** Ends the streams, stops reading, closes the server. @param {Panel} panel @param {import('node:http').Server} server */
const closed = (panel, server) => new Promise((done) => {
  stopped(panel)
  for (const client of panel.clients) client.end()
  panel.clients.clear()
  server.close(() => done(undefined))
  server.closeAllConnections()
})
