#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createJsonStateReader } from '../adapters/infrastructure/json-state-reader.mjs'
import { createJsonStateWriter } from '../adapters/infrastructure/state/json-state-writer.mjs'
import { createJsonStateBackupReader } from '../adapters/infrastructure/state/json-state-backup-reader.mjs'
import { createJsonStateArchive } from '../adapters/infrastructure/state/json-state-archive.mjs'
import { createStateService } from '../application/state-service.mjs'
import { createPhaseGate } from '../application/phase-gate-service.mjs'
import { createTrackingFiles } from '../adapters/infrastructure/tracking-files.mjs'
import { createRecoveryService } from '../application/recovery-service.mjs'
import { createGitCommitLogReader } from '../adapters/infrastructure/git-commit-log-reader.mjs'
import { createCommitScanService } from '../application/commit-scan-service.mjs'
import { resolveTrackingRoot } from '../adapters/infrastructure/tracking-root-resolver.mjs'
import { createActiveSlugStore } from '../adapters/infrastructure/active-slug-store.mjs'
import { firstValidProjectSlug, isValidProjectSlug } from '../domain/value-objects.mjs'

// basePath: resolved from SKRAFT_TRACKING_ROOT (explicit) → SKRAFT_TRACKING_LAYOUT env →
// skraft-config.json::trackingLayout → default namespaced. State lives at {basePath}/{slug}/.
const basePath = resolveTrackingRoot()

const stateReader = createJsonStateReader(basePath)
const stateWriter = createJsonStateWriter(basePath)
const backupReader = createJsonStateBackupReader(basePath)
const activeSlug = createActiveSlugStore(basePath)
// Framework config: skraft-framework.config.json beside this runtime (SKRAFT_CONFIG
// overrides). An unreadable config leaves the state machine on its default order and
// the phase closures ungated.
const readFrameworkConfig = () => {
  const configPath = process.env.SKRAFT_CONFIG
    ?? fileURLToPath(new URL('../../skraft-framework.config.json', import.meta.url))
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'))
  } catch {
    return null
  }
}
const frameworkConfig = readFrameworkConfig()
const publishedOrder = frameworkConfig?.phaseOrder
const phaseOrder = Array.isArray(publishedOrder) && publishedOrder.length > 0
  && publishedOrder.every((phase) => typeof phase === 'string' && phase.length > 0)
  ? publishedOrder : undefined

const now = () => new Date().toISOString()

// HEAD of the repository the CLI runs in; null outside a git work tree.
const headSha = () => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null
  } catch {
    return null
  }
}

const phaseGate = frameworkConfig?.phaseAgents
  ? createPhaseGate({ config: frameworkConfig, trackingFiles: createTrackingFiles(basePath), git: { headSha: async () => headSha() } })
  : undefined

const service = createStateService({ stateReader, stateWriter, phaseOrder, phaseGate })
const recoveryService = createRecoveryService({
  stateReader, stateWriter, backupReader, stateArchive: createJsonStateArchive(basePath), stateService: service,
})
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
  const explicitSlug = arg('slug')
  if (explicitSlug !== undefined && !isValidProjectSlug(explicitSlug)) {
    writeError('INVALID_ARGUMENT', `--slug must be a kebab-case project slug, got: ${explicitSlug}`)
    process.exitCode = 1
    return
  }
  // Without --slug, act on the active pipeline (SKRAFT_PROJECT_SLUG, then the recorded pointer).
  const slug = firstValidProjectSlug(explicitSlug, process.env.SKRAFT_PROJECT_SLUG, activeSlug.read()) ?? undefined

  switch (subcommand) {
    case 'init': {
      if (explicitSlug === undefined) {
        writeError('INVALID_ARGUMENT', 'init requires --slug')
        process.exitCode = 1
        return
      }
      const result = await service.init(slug)
      if (!result.ok) {
        writeError(result.error.code, result.error.reason)
        process.exitCode = domainExitCode(result.error.code)
        return
      }
      activeSlug.write(slug)
      writeSuccess({ created: result.value.created, currentPhase: result.value.currentPhase })
      break
    }

    case 'select': {
      if (explicitSlug === undefined) {
        writeError('INVALID_ARGUMENT', 'select requires --slug')
        process.exitCode = 1
        return
      }
      const result = await service.get(slug, 'currentPhase')
      if (!result.ok) {
        const code = result.error.code === 'ENOENT' ? 'NO_STATE' : result.error.code
        writeError(code, `no pipeline state for ${slug}; run init first`)
        process.exitCode = domainExitCode(code)
        return
      }
      activeSlug.write(slug)
      writeSuccess({ selected: slug, currentPhase: result.value })
      break
    }

    case 'transition': {
      const to = arg('to')
      const result = await service.applyEvent(slug, { type: 'ADVANCE', targetPhase: to, at: now() })
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
      const result = await service.applyEvent(slug, { type: 'CLOSE_PHASE', phase, verdict, path, at: now() })
      if (!result.ok) {
        writeError(result.error.code, result.error.reason)
        process.exitCode = domainExitCode(result.error.code)
        return
      }
      writeSuccess(result.value)
      break
    }

    case 'set': {
      const field = arg('field')
      const data = arg('data')
      let value
      try {
        value = JSON.parse(data)
      } catch {
        writeError('INVALID_ARGUMENT', `--data must be JSON, got: ${data}`)
        process.exitCode = 1
        return
      }
      const result = await service.applyEvent(slug, { type: 'SET_METADATA', field, value })
      if (!result.ok) {
        writeError(result.error.code, result.error.reason)
        process.exitCode = domainExitCode(result.error.code)
        return
      }
      writeSuccess(result.value)
      break
    }

    case 'mark-phase-started': {
      const phase = arg('phase')
      const result = await service.applyEvent(slug, { type: 'MARK_PHASE_STARTED', phase, at: now(), baseSha: headSha() })
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

    case 'reset': {
      // Start over from a state no command can use; the old file is kept beside it.
      const result = await recoveryService.reset(slug)
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
