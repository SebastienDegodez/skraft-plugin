#!/usr/bin/env node
import { join } from 'node:path'
import { createJsonStateReader } from '../adapters/infrastructure/json-state-reader.mjs'
import { createJsonStateWriter } from '../adapters/infrastructure/state/json-state-writer.mjs'
import { createJsonStateBackupReader } from '../adapters/infrastructure/state/json-state-backup-reader.mjs'
import { createStateService } from '../application/state-service.mjs'
import { createRecoveryService } from '../application/recovery-service.mjs'
import { createGitCommitLogReader } from '../adapters/infrastructure/git-commit-log-reader.mjs'
import { createCommitScanService } from '../application/commit-scan-service.mjs'

// basePath: SKRAFT_TRACKING_ROOT env var OR .copilot-tracking/skraft-plans (cwd)
const basePath = process.env.SKRAFT_TRACKING_ROOT
  ?? join(process.cwd(), '.copilot-tracking', 'skraft-plans')

const stateReader = createJsonStateReader(basePath)
const stateWriter = createJsonStateWriter(basePath)
const backupReader = createJsonStateBackupReader(basePath)
const service = createStateService({ stateReader, stateWriter })
const recoveryService = createRecoveryService({ stateReader, stateWriter, backupReader, stateService: service })
const commitScanService = createCommitScanService({
  commitLogReader: createGitCommitLogReader({ cwd: process.cwd() })
})

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

    case 'close-phase': {
      const phase = arg('phase')
      const verdict = arg('verdict')
      const path = arg('artifact')
      const result = await service.applyEvent(slug, { type: 'CLOSE_PHASE', phase, verdict, path })
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

    case 'incr-rework': {
      const phase = arg('phase')
      const findingsArg = arg('findings')
      const event = { type: 'INCR_REWORK', phase }
      if (findingsArg !== undefined) {
        const findings = Number.parseInt(findingsArg, 10)
        // `0` is deliberately accepted: a rework pass can be a no-op re-verification
        // (e.g. confirming a prior fix, no new findings resolved this pass).
        if (!Number.isInteger(findings) || findings < 0) {
          writeError('INVALID_ARGUMENT', `--findings must be a non-negative integer, got: ${findingsArg}`)
          process.exitCode = 1
          return
        }
        event.findings = findings
      }
      const result = await service.applyEvent(slug, event)
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

    case 'scan-commits': {
      const countArg = arg('count')
      const count = Number.parseInt(countArg ?? '20', 10)
      if (!Number.isInteger(count) || count <= 0) {
        writeError('INVALID_ARGUMENT', `--count must be a positive integer, got: ${countArg}`)
        process.exitCode = 1
        return
      }
      const result = await commitScanService.scanRecent(count)
      writeSuccess(result)
      // Non-zero exit signals rework-worthy commits without treating it as an IO/domain error.
      process.exitCode = result.nonConventional.length > 0 ? 1 : 0
      break
    }

    case 'diagnose': {
      // AC1: emit actionable WHY/HOW/ACTION guidance for the current state health.
      const result = await recoveryService.diagnose(slug)
      if (!result.ok) {
        writeError(result.error.code, result.error.reason)
        process.exitCode = domainExitCode(result.error.code)
        return
      }
      writeSuccess(result.value)
      break
    }

    case 'rollback': {
      // AC2: restore the most recent healthy backup (state.json.bak.*).
      const result = await recoveryService.rollback(slug)
      if (!result.ok) {
        writeError(result.error.code, result.error.reason)
        process.exitCode = domainExitCode(result.error.code)
        return
      }
      writeSuccess(result.value)
      break
    }

    case 'resolve-stale': {
      // AC3: reset the stuck phase retry budget so the phase can be relaunched.
      const phase = arg('phase')
      const result = await recoveryService.resolveStale(slug, phase)
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
