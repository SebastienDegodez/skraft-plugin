#!/usr/bin/env node
// Serve the docs site locally so the dashboard can be read in a browser.
//
// The published dashboard is a static page: Jekyll copies docs/site/dashboard/
// verbatim, and the page reads its data from docs/site/dashboard/data/. A plain
// static file server is therefore enough to see exactly what production shows.
//
//   node eng/dashboard/serve.mjs [--root docs/site] [--port 4173]
import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    root: { type: 'string', default: 'docs/site' },
    port: { type: 'string', default: '4173' },
    help: { type: 'boolean', default: false },
  },
  strict: true,
})

if (values.help) {
  console.log('Usage: node eng/dashboard/serve.mjs [--root docs/site] [--port 4173]')
  process.exit(0)
}

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'))
const root = resolve(repoRoot, values.root)
const port = Number(values.port)

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jsonl': 'application/x-ndjson; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

// A request path may only ever address a file inside the served root: decode it,
// normalise away any `..`, then re-check containment before touching the disk.
const resolveFile = (requestUrl) => {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname)
  } catch {
    return null
  }
  const candidate = resolve(root, `.${normalize(pathname)}`)
  if (candidate !== root && !candidate.startsWith(root + sep)) return null
  try {
    return statSync(candidate).isDirectory() ? join(candidate, 'index.html') : candidate
  } catch {
    return null
  }
}

createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD' }).end()
    return
  }

  const file = resolveFile(request.url ?? '/')
  if (!file) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found\n')
    return
  }

  const stream = createReadStream(file)
  stream.on('error', () => {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found\n')
  })
  stream.once('open', () => {
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
  })
  stream.pipe(response)
}).listen(port, '127.0.0.1', () => {
  console.log(`Serving ${values.root} on http://127.0.0.1:${port}`)
  console.log(`Dashboard: http://127.0.0.1:${port}/dashboard/`)
})
