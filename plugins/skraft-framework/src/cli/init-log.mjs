#!/usr/bin/env node
import { join } from 'node:path'
import { createJsonExecutionLogReader } from '../adapters/infrastructure/execution-log/json-execution-log-reader.mjs'
import { createJsonExecutionLogWriter } from '../adapters/infrastructure/execution-log/json-execution-log-writer.mjs'
import { createSystemTime } from '../adapters/infrastructure/system-time.mjs'
import { createExecutionLogService } from '../application/execution-log-service.mjs'

// S7 tool bridge — init-log: idempotently creates {slug}/execution-log.json.
// Exit codes: 0 success / 1 validation / 2 usage (or IO).
//
// basePath: SKRAFT_TRACKING_ROOT env var OR .copilot-tracking/skraft-plans (cwd).
const basePath = process.env.SKRAFT_TRACKING_ROOT
  ?? join(process.cwd(), '.copilot-tracking', 'skraft-plans')

const logReader = createJsonExecutionLogReader(basePath)
const logWriter = createJsonExecutionLogWriter(basePath)
const clock = createSystemTime()
const service = createExecutionLogService({ logReader, logWriter, clock })

const argv = process.argv.slice(2)

function arg(name) {
  const idx = argv.indexOf(`--${name}`)
  return idx !== -1 ? argv[idx + 1] : undefined
}

const VALIDATION_CODES = new Set(['INVALID_ENTRY', 'INVALID_LOG', 'INCOMPLETE_LOG', 'CORRUPTED_LOG'])

function exitCode(code) {
  return VALIDATION_CODES.has(code) ? 1 : 2
}

function writeError(code, reason) {
  process.stderr.write(JSON.stringify({ code, reason }) + '\n')
}

async function run() {
  const slug = arg('slug')
  if (slug === undefined) {
    writeError('MISSING_ARGUMENT', '--slug is required')
    process.exitCode = 2
    return
  }

  const result = await service.init(slug)
  if (!result.ok) {
    writeError(result.error.code, result.error.reason)
    process.exitCode = exitCode(result.error.code)
    return
  }
  process.stdout.write(JSON.stringify({ created: result.value.created, slug: result.value.slug }) + '\n')
}

run().catch((err) => {
  writeError('IO_ERROR', err.message)
  process.exitCode = 2
})
