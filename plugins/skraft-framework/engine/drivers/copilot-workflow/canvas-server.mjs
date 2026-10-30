import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The loopback server of one open `skraft-pipeline` canvas panel, started by the canvas's
 * `open`, never at import. It serves the page and streams the panel content as server-sent
 * events while a page listens (read again every `pollMs`, sent when it changed). It takes no
 * answer: Copilot puts each question to the person in the chat. The one thing it takes is an
 * edit of the configuration the page sends (`POST /configuration`), which the engine checks and
 * saves. Every request names the bound loopback address as its Host (no DNS rebinding). The
 * panel's token travels only in the url `open` gives the host (`/?t=<token>`): the page, the
 * stream and an edit each need it (an edit in the `X-Skraft-Token` header, which a form of
 * another site cannot send, from no other origin), compared in constant time, so that neither
 * another local process nor a browser page reads the view or writes the configuration. The page
 * runs under `default-src 'none'`. Refusals and failures are said by fixed texts.
 *
 * @typedef {{ content: () => Promise<object>, pollMs: number, limits?: { pingMs?: number }, save: (edit: unknown) => Promise<{ ok: boolean, reason: string }> }} PanelHost
 *   content: what the page draws now; save: the edit the page sends, saved or refused with why;
 *   limits: the times of the server, each LIMITS value unless given (a test gives shorter ones).
 * @typedef {PanelHost & {
 *   token: string, origin: string, host: string, clients: Set<import('node:http').ServerResponse>,
 *   last: string | null, timers: NodeJS.Timeout[], focus: string | null, pingMs: number,
 * }} Panel
 *   host: the bound loopback address, the only Host a request may name; last: the content sent last;
 *   focus: the tab to show that no page was there to receive, kept for the next page.
 * @typedef {{ panel?: Panel }} Bound the panel, once its server listens (`once` rejects when the listen fails)
 * @typedef {{ url: string, listened: () => boolean, focus: (tab: string) => void, close: () => Promise<void> }} RunningPanel
 *   listened: whether a page listens to the panel now; focus: the tab the pages show, a valid one.
 */

const UI = fileURLToPath(new URL('./canvas-ui/', import.meta.url))
const LOOPBACK = '127.0.0.1'
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'"
const SCRIPT = 'text/javascript; charset=utf-8'
const ASSETS = Object.freeze({ '/app.js': SCRIPT, '/view.js': SCRIPT, '/i18n.js': SCRIPT, '/reconnect.js': SCRIPT, '/styles.css': 'text/css; charset=utf-8' })
/** The largest edit a page sends, in bytes. */
const MAX_EDIT = 64 * 1024
/** The times of the server, in ms; a test gives shorter ones through PanelHost.limits. */
// Stryker disable next-line ObjectLiteral: production value; the tests give their own, the time itself is not observable there
const LIMITS = Object.freeze({ pingMs: 15_000 })
/** How long a page that lost its stream waits before trying again (reconnect.js waits 1.5 s first too). */
const RETRY_MS = 1500
const PING = ': ping\n\n'
const REFUSALS = Object.freeze({
  host: [421, 'this panel answers only on its loopback address'],
  forbidden: [403, 'this request does not come from the panel'],
  missing: [404, 'nothing here'],
  type: [415, 'the panel sends its edits as JSON'],
  large: [413, 'the edit is larger than the panel sends'],
  edit: [400, 'the request holds no configuration edit'],
  failed: [500, 'skraft could not answer; run skraft status in a terminal'],
})

/** @param {PanelHost} host @returns {Promise<RunningPanel>} */
export const startPanel = async (host) => {
  const limits = { ...LIMITS, ...host.limits }
  const bound = /** @type {Bound} */ ({})
  const server = createServer((req, res) => { void served(/** @type {Panel} */ (bound.panel), req, res) })
  server.listen(0, LOOPBACK)
  await once(server, 'listening')
  bound.panel = panelOf(host, limits, server)
  return runningPanel(bound.panel, server)
}

/** @param {PanelHost} host @param {typeof LIMITS} limits @param {import('node:http').Server} server @returns {Panel} */
const panelOf = (host, limits, server) => {
  const address = `${LOOPBACK}:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`
  return { ...host, token: randomBytes(24).toString('hex'), host: address, origin: `http://${address}`, clients: new Set(), last: null, timers: [], focus: null, pingMs: limits.pingMs }
}

/** @param {Panel} panel @param {import('node:http').Server} server @returns {RunningPanel} */
const runningPanel = (panel, server) => Object.freeze({ url: `${panel.origin}/?t=${panel.token}`, listened: () => panel.clients.size > 0, focus: (tab) => pointed(panel, tab), close: () => closed(panel, server) })

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
  ...Object.fromEntries(Object.keys(ASSETS).map((path) => [`GET ${path}`, (/** @type {Panel} */ _panel, /** @type {any} */ _req, /** @type {import('node:http').ServerResponse} */ res) => asset(res, /** @type {keyof typeof ASSETS} */ (path))])),
  'GET /events': (panel, req, res, query) => subscribed(panel, req, res, query),
  'POST /configuration': (panel, req, res) => saved(panel, req, res),
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
  res.write(`retry: ${RETRY_MS}\n\n`)
  delivered(panel, res)
  panel.clients.add(res)
  res.on('close', () => left(panel, res))
  await published(panel, true)
  watched(panel)
}

/**
 * The tab the pages show, a valid one: sent to every page that listens, else kept for the next page.
 * @param {Panel} panel @param {string} tab
 */
const pointed = (panel, tab) => {
  if (panel.clients.size > 0) sent(panel, focusFrame(tab))
  else panel.focus = tab
}

/**
 * The tab kept for the next page, written to it before anything awaits: a write after the stream
 * ended would emit an error on the response, which nothing listens to.
 * @param {Panel} panel @param {import('node:http').ServerResponse} res
 */
const delivered = (panel, res) => {
  if (panel.focus === null) return
  res.write(focusFrame(panel.focus))
  panel.focus = null
}

/** @param {string} tab */
const focusFrame = (tab) => `event: focus\ndata: ${JSON.stringify({ tab })}\n\n`

/** @param {Panel} panel @param {string} frame */
const sent = (panel, frame) => {
  for (const client of panel.clients) client.write(frame)
}

/**
 * An edit of the configuration from the panel's page, saved by the engine: the pages get the new
 * content at the next read; refused, and nothing written, when it does not come from the page or
 * holds no edit.
 * @param {Panel} panel @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res
 */
const saved = async (panel, req, res) => {
  const refusal = editRefusal(panel, req)
  if (refusal !== null) return refuse(res, refusal)
  const body = await bodyOf(req)
  if (typeof body === 'string') return refuse(res, body)
  const result = await panel.save(body)
  json(res, result.ok ? 200 : 422, result)
}

/**
 * Why a request is no edit from the panel's page, null when it is one.
 * @param {Panel} panel @param {import('node:http').IncomingMessage} req @returns {keyof typeof REFUSALS | null}
 */
const editRefusal = (panel, req) => {
  if (!isToken(panel, req.headers['x-skraft-token']) || ![undefined, panel.origin].includes(req.headers.origin)) return 'forbidden'
  return /^application\/json\b/.test(req.headers['content-type'] ?? '') ? null : 'type'
}

/**
 * The JSON object the request holds; the refusal when it is too large, or no object.
 * @param {import('node:http').IncomingMessage} req @returns {Promise<Record<string, unknown> | 'large' | 'edit'>}
 */
const bodyOf = async (req) => {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size <= MAX_EDIT) chunks.push(chunk)
  }
  return size > MAX_EDIT ? 'large' : objectOf(Buffer.concat(chunks).toString('utf8'))
}

/** @param {string} text @returns {Record<string, unknown> | 'edit'} */
const objectOf = (text) => {
  try {
    const value = JSON.parse(text)
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : 'edit'
  } catch {
    return 'edit'
  }
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
  sent(panel, `data: ${text}\n\n`)
}

/** Reads the content again every pollMs and pings every pingMs, while a page listens. @param {Panel} panel */
const watched = (panel) => {
  if (panel.timers.length > 0) return
  panel.timers = [every(panel.pollMs, () => published(panel, false)), every(panel.pingMs, () => sent(panel, PING))]
}

/** @param {number} ms @param {() => unknown} act a timer that does not keep the process alive and never throws */
const every = (ms, act) => {
  const timer = setInterval(() => { void Promise.resolve().then(act).catch(() => undefined) }, ms)
  timer.unref()
  return timer
}

/** @param {Panel} panel @param {import('node:http').ServerResponse} res */
const left = (panel, res) => {
  panel.clients.delete(res)
  if (panel.clients.size === 0) stopped(panel)
}

/** @param {Panel} panel */
const stopped = (panel) => {
  for (const timer of panel.timers) clearInterval(timer)
  panel.timers = []
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
