// The loopback server every canvas panel shares. Every call needs the per-process token that only
// the served page carries, the Host must be the loopback address (no DNS rebinding), and mutating
// calls need a custom header a cross-site form cannot send.
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const UI_DIR = join(dirname(fileURLToPath(import.meta.url)), 'ui')
const STATIC = Object.freeze({
  '/styles.css': 'text/css; charset=utf-8',
  '/app.mjs': 'text/javascript; charset=utf-8',
  '/view.mjs': 'text/javascript; charset=utf-8',
  '/i18n.mjs': 'text/javascript; charset=utf-8',
})
const MAX_BODY = 256 * 1024
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors *"

/**
 * @param {{ controller: ReturnType<typeof import('./controller.mjs').createController>, port?: number, onError?: (error: Error) => void }} options
 */
export const startServer = async ({ controller, port = 0, onError }) => {
  const token = randomBytes(24).toString('hex')
  const byName = new Map(controller.actions.map((action) => [action.name, action]))
  const clients = new Set()
  const broadcast = () => {
    const payload = `data: ${JSON.stringify(controller.snapshot())}\n\n`
    for (const res of clients) res.write(payload)
  }
  controller.events.on('change', broadcast)
  let address = ''

  const server = createServer(async (req, res) => {
    try {
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Referrer-Policy', 'no-referrer')
      if (req.headers.host !== address) return json(res, 421, { error: 'Misdirected request' })
      const url = new URL(req.url ?? '/', `http://${address}`)
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        const html = (await readFile(join(UI_DIR, 'index.html'), 'utf8')).replace('__CANVAS_TOKEN__', token)
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': CSP })
        return res.end(html)
      }
      if (req.method === 'GET' && Object.hasOwn(STATIC, url.pathname)) {
        res.writeHead(200, { 'Content-Type': STATIC[url.pathname], 'Cache-Control': 'no-store' })
        return res.end(await readFile(join(UI_DIR, url.pathname.slice(1))))
      }
      if (req.method === 'GET' && url.pathname === '/events') {
        if (!same(url.searchParams.get('token'), token)) return json(res, 403, { error: 'Forbidden' })
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
        res.write(`data: ${JSON.stringify(controller.snapshot())}\n\n`)
        clients.add(res)
        const ping = setInterval(() => res.write(': ping\n\n'), 20_000)
        req.on('close', () => {
          clearInterval(ping)
          clients.delete(res)
        })
        return
      }
      if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
        if (!same(req.headers['x-canvas-token'], token)) return json(res, 403, { error: 'Forbidden' })
        const action = byName.get(url.pathname.slice(5))
        if (!action) return json(res, 404, { error: 'Unknown action' })
        let input
        try {
          input = await readBody(req)
        } catch (error) {
          return json(res, 400, { error: /** @type {Error} */ (error).message })
        }
        try {
          return json(res, 200, { result: (await action.run(input)) ?? null })
        } catch (error) {
          const failure = /** @type {Error} */ (error)
          if (failure.name !== 'UserError') onError?.(failure)
          return json(res, failure.name === 'UserError' ? 400 : 500, { error: failure.message })
        }
      }
      return json(res, 404, { error: 'Not found' })
    } catch (error) {
      onError?.(/** @type {Error} */ (error))
      if (!res.headersSent) json(res, 500, { error: /** @type {Error} */ (error).message })
    }
  })

  await new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(undefined)))
  const { port: bound } = /** @type {import('node:net').AddressInfo} */ (server.address())
  address = `127.0.0.1:${bound}`
  return {
    url: `http://${address}/`,
    token,
    broadcast,
    close: () => new Promise((resolve) => {
      controller.events.off('change', broadcast)
      for (const res of clients) res.end()
      server.close(() => resolve(undefined))
    }),
  }
}

/** @param {unknown} given @param {string} token */
const same = (given, token) => typeof given === 'string' && given.length === token.length && timingSafeEqual(Buffer.from(given), Buffer.from(token))

/** @param {import('node:http').ServerResponse} res @param {number} status @param {unknown} body */
const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

/** @param {import('node:http').IncomingMessage} req @returns {Promise<Record<string, unknown>>} */
const readBody = (req) => new Promise((resolve, reject) => {
  let size = 0
  const chunks = []
  req.on('data', (chunk) => {
    if (size > MAX_BODY) return
    size += chunk.length
    if (size > MAX_BODY) {
      // Drop what was read and let the rest drain: destroying the socket here would leave the
      // client with a reset instead of the 400 it is answered.
      chunks.length = 0
      reject(new Error('Request body too large'))
      return
    }
    chunks.push(chunk)
  })
  req.on('end', () => {
    if (size > MAX_BODY) return
    const text = Buffer.concat(chunks).toString('utf8')
    if (!text) return resolve({})
    try {
      const value = JSON.parse(text)
      if (!value || typeof value !== 'object' || Array.isArray(value)) return reject(new Error('The body must be a JSON object'))
      resolve(value)
    } catch {
      reject(new Error('Invalid JSON body'))
    }
  })
  req.on('error', reject)
})
