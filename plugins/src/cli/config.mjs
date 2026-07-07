#!/usr/bin/env node
import { createJsonConfigReader } from '../adapters/infrastructure/config/json-config-reader.mjs'
import { createJsonConfigWriter } from '../adapters/infrastructure/config/json-config-writer.mjs'
import { createConfigService } from '../application/config-service.mjs'

// basePath: SKRAFT_CONFIG_ROOT env var OR the current working directory (repo root).
// The repo-wide config lives at {basePath}/skraft-config.json.
const basePath = process.env.SKRAFT_CONFIG_ROOT ?? process.cwd()

const configReader = createJsonConfigReader(basePath)
const configWriter = createJsonConfigWriter(basePath)
const service = createConfigService({ configReader, configWriter })

const argv = process.argv.slice(2)
const subcommand = argv[0]
const rest = argv.slice(1)

function arg(name) {
  const idx = rest.indexOf(`--${name}`)
  return idx !== -1 ? rest[idx + 1] : undefined
}

function domainExitCode(code) {
  if (code === 'IO_ERROR' || code === 'CORRUPTED_CONFIG') return 2
  if (code === 'INVALID_CONFIG' || code === 'INVALID_VALUE' || code === 'UNKNOWN_KEY') return 3
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
  switch (subcommand) {
    case 'init': {
      const result = await service.init()
      if (!result.ok) {
        writeError(result.error.code, result.error.reason)
        process.exitCode = domainExitCode(result.error.code)
        return
      }
      writeSuccess({ created: result.value.created, depthTier: result.value.depthTier })
      break
    }

    case 'get': {
      const key = arg('key')
      const result = await service.get(key)
      if (!result.ok) {
        writeError(result.error.code, result.error.reason)
        process.exitCode = domainExitCode(result.error.code)
        return
      }
      const val = result.value
      if (key !== undefined && (val === null || typeof val !== 'object')) {
        process.stdout.write(String(val) + '\n')
      } else {
        writeSuccess(val)
      }
      break
    }

    case 'set': {
      const key = arg('key')
      const value = arg('value')
      const result = await service.set(key, value)
      if (!result.ok) {
        writeError(result.error.code, result.error.reason)
        process.exitCode = domainExitCode(result.error.code)
        return
      }
      writeSuccess(result.value)
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
