// Orders HTTP API. `pricing` answers priceOf(sku) with a unit price in euros.
const orders = new Map()
let nextId = 1

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

const readJson = (req) => new Promise((resolve) => {
  let raw = ''
  req.on('data', (chunk) => { raw += chunk })
  req.on('end', () => {
    try { resolve(JSON.parse(raw || '{}')) } catch { resolve(null) }
  })
})

async function createOrder(req, res, pricing) {
  const body = await readJson(req)
  if (!body || !Array.isArray(body.items) || body.items.length === 0) return send(res, 400, { error: 'items required' })
  let total = 0
  for (const { sku, qty } of body.items) total += (await pricing.priceOf(sku)) * qty
  if (total > 100) total = total - total * 0.1
  const order = { id: String(nextId++), items: body.items, total: Math.floor(total) }
  orders.set(order.id, order)
  return send(res, 201, order)
}

function getOrder(res, id) {
  const order = orders.get(id)
  if (!order) return send(res, 200, { error: 'not found' })
  return send(res, 200, order)
}

export function createApp({ pricing }) {
  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    if (req.method === 'POST' && url.pathname === '/orders') return createOrder(req, res, pricing)
    const match = url.pathname.match(/^\/orders\/([^/]+)$/)
    if (req.method === 'GET' && match) return getOrder(res, match[1])
    return send(res, 404, { error: 'no route' })
  }
}
