#!/usr/bin/env node
import { join } from 'node:path'
import { createJsonStateReader } from '../adapters/infrastructure/json-state-reader.mjs'
import { createJsonStateWriter } from '../adapters/infrastructure/state/json-state-writer.mjs'
import { createStateService } from '../application/state-service.mjs'

// basePath: SKRAFT_TRACKING_ROOT env var OR .copilot-tracking/skraft-plans (cwd)
const basePath = process.env.SKRAFT_TRACKING_ROOT
  ?? join(process.cwd(), '.copilot-tracking', 'skraft-plans')

const stateReader = createJsonStateReader(basePath)
const stateWriter = createJsonStateWriter(basePath)
const service = createStateService({ stateReader, stateWriter })

const argv = process.argv.slice(2)
const subcommand = argv[0]
const rest = argv.slice(1)

function arg(name) {
  const idx = rest.indexOf(`--${name}`)
  return idx !== -1 ? rest[idx + 1] : undefined
}

function domainExitCode(code) {
  if (code === 'IO_ERROR' || code === 'CORRUPTED_STATE') return 2
  if (code === 'INVALID_STATE') return 3
  return 1
}

function writeError(code, reason) {
  process.stderr.write(JSON.stringify({ code, reason }) + '\n')
}

function writeSuccess(data) {
  if (data !== null && typeof data === 'object') {
    process.stdout.write(JSON.stringify(data) + '\n')
  } else {
    process.stdout.write(String(data) + '\n')
  }
}

async function run() {
  const slug = arg('slug')

  switch (subcommand) {
    case 'init': {
      const result = await service.init(slug)
      if (!result.ok) {
        writeError(result.error.code, result.error.reason)
        process.exitCode = domainExitCode(result.error.code)
        return
      }
      writeSuccess({ created: result.value.created, currentPhase: result.value.currentPhase })
      break
    }

    case 'transition': {
      const to = arg('to')
      const result = await service.applyEvent(slug, { type: 'ADVANCE', targetPhase: to })
      if (!result.ok) {
        writeError(result.error.code, result.error.reason)
        process.exitCode = domainExitCode(result.error.code)
        return
      }
      writeSuccess(result.value)
      break
    }

    case 'record-verdict': {
      const phase = arg('phase')
      const verdict = arg('verdict')
      const result = await service.applyEvent(slug, { type: 'RECORD_VERDICT', phase, verdict })
      if (!result.ok) {
        writeError(result.error.code, result.error.reason)
        process.exitCode = domainExitCode(result.error.code)
        return
      }
      writeSuccess(result.value)
      break
    }

    case 'record-artifact': {
      const phase = arg('phase')
      const path = arg('path')
      const result = await service.applyEvent(slug, { type: 'RECORD_ARTIFACT', phase, path })
      if (!result.ok) {
        writeError(result.error.code, result.error.reason)
        process.exitCode = domainExitCode(result.error.code)
        return
      }
      writeSuccess(result.value)
      break
    }

    case 'record-review-artifact': {
      const phase = arg('phase')
      const path = arg('path')
      const result = await service.applyEvent(slug, { type: 'RECORD_REVIEW_ARTIFACT', phase, path })
      if (!result.ok) {
        writeError(result.error.code, result.error.reason)
        process.exitCode = domainExitCode(result.error.code)
        return
      }
      writeSuccess(result.value)
      break
    }

    case 'set-difficulty': {
      const value = arg('value')
      const result = await service.applyEvent(slug, { type: 'SET_DIFFICULTY', value })
      if (!result.ok) {
        writeError(result.error.code, result.error.reason)
        process.exitCode = domainExitCode(result.error.code)
        return
      }
      writeSuccess(result.value)
      break
    }

    case 'incr-retry': {
      const phase = arg('phase')
      const result = await service.applyEvent(slug, { type: 'INCR_RETRY', phase })
      if (!result.ok) {
        writeError(result.error.code, result.error.reason)
        process.exitCode = domainExitCode(result.error.code)
        return
      }
      writeSuccess(result.value)
      break
    }

    case 'get': {
      const field = arg('field')
      const result = await service.get(slug, field)
      if (!result.ok) {
        writeError(result.error.code, result.error.reason)
        process.exitCode = domainExitCode(result.error.code)
        return
      }
      const val = result.value
      // AC8: scalar field → raw value (not JSON-wrapped)
      if (field !== undefined && (val === null || typeof val !== 'object')) {
        process.stdout.write(String(val) + '\n')
      } else {
        writeSuccess(val)
      }
      break
    }

    default:
      writeError('UNKNOWN_SUBCOMMAND', `unknown subcommand: ${subcommand}`)
      process.exitCode = 1
  }
}

run().catch((err) => {
  process.stderr.write(JSON.stringify({ code: 'IO_ERROR', reason: err.message }) + '\n')
  process.exitCode = 2
})
