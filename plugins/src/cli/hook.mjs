#!/usr/bin/env node
import { createHookService } from '../adapters/api/hooks/service-factory.mjs'

// CLI flow is dead simple: stdin in, parse JSON, route hook, stdout out.
let raw = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) raw += chunk

const payload = raw ? JSON.parse(raw) : {}
const hookService = createHookService()
const result = await hookService.handle(payload)

if (result !== undefined) {
  process.stdout.write(JSON.stringify(result))
}
