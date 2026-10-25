import { createServer } from 'node:http'
import { db } from './db.mjs'
import { lastPosition } from './telematics.mjs'

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

const readJson = (req) => new Promise((resolve) => {
  let raw = ''
  req.on('data', (chunk) => { raw += chunk })
  req.on('end', () => resolve(JSON.parse(raw || '{}')))
})

export const handler = async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  if (req.method === 'GET' && url.pathname === '/vehicles') return send(res, 200, await db.all('vehicles'))
  if (req.method === 'POST' && url.pathname === '/vehicles') {
    const vehicle = await readJson(req)
    if (!vehicle.plate) return send(res, 400, { error: 'plate required' })
    return send(res, 201, await db.insert('vehicles', { ...vehicle, status: 'active' }))
  }
  const maintenance = url.pathname.match(/^\/vehicles\/([^/]+)\/maintenance$/)
  if (req.method === 'POST' && maintenance) {
    const vehicle = await db.find('vehicles', maintenance[1])
    if (vehicle.mileage > 20000) vehicle.status = 'maintenance-due'
    return send(res, 200, await db.update('vehicles', vehicle))
  }
  const position = url.pathname.match(/^\/vehicles\/([^/]+)\/position$/)
  if (req.method === 'GET' && position) return send(res, 200, await lastPosition(position[1]))
  // Old monthly export, kept for the accounting team.
  if (req.method === 'GET' && url.pathname === '/reports/monthly') return send(res, 200, { rows: await db.all('vehicles'), format: 'v1' })
  return send(res, 404, { error: 'no route' })
}

if (process.argv[1]?.endsWith('server.mjs')) createServer(handler).listen(Number(process.env.PORT ?? 3000))
