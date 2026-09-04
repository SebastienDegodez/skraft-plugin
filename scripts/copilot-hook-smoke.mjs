#!/usr/bin/env node
//
// copilot-hook-smoke.mjs — does the Copilot CLI actually run this plugin's hooks?
//
// Unit tests prove the hook CLI emits the right JSON. They cannot prove a harness
// FINDS the hook manifest, spawns the command, and honors what it wrote back. Only a
// real session can, and nothing here does that today: the Vally executor runs the SDK
// in `mode: 'empty'`, where `installedPlugins` is forced to `[]`, so no plugin — and
// therefore no plugin hook — is ever loaded in an eval.
//
// So this drives the real `copilot` binary against a THROWAWAY COPILOT_HOME with only
// this plugin installed. Nothing touches the developer's own ~/.copilot, and the
// ambient plugins/settings of the host cannot contaminate the verdict.
//
// Two probes, because they fail differently:
//
//   allowed  — a benign command. Proves the hook was found and spawned at all
//              (the plugin's own audit log is the receipt).
//   denied   — a command G7 forbids. Proves the harness HONORED the refusal.
//              This is the one that matters: an invalid hook payload is SILENT on
//              Copilot (its reader JSON.parses stdout and discards on failure), so a
//              wire-format regression shows up here as a write that went through,
//              never as an error in the log.
//
// Usage:  node scripts/copilot-hook-smoke.mjs [--keep] [--model <id>]
// Needs:  the `copilot` CLI on PATH, and COPILOT_GITHUB_TOKEN or `gh auth login`.
// Exits:  0 every probe passed, 1 a probe failed, 2 the harness could not run.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const { values: opts } = parseArgs({
  options: {
    keep: { type: 'boolean', default: false },
    model: { type: 'string' },
    'setup-only': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
})

const USAGE = `usage: node scripts/copilot-hook-smoke.mjs [--keep] [--setup-only] [--model <id>]

  --keep        keep the throwaway COPILOT_HOME and debug logs on success
  --setup-only  build the throwaway home and exit, without calling the model
  --model <id>  model for the probe sessions (default: the CLI's own)
`

if (opts.help) { process.stdout.write(USAGE); process.exit(0) }

// The plugin's own audit JSONL is the receipt that a hook process actually ran: the
// harness never reports "I spawned your hook", but every guard evaluation appends a line.
const AUDIT_LOG = 'audit.jsonl'

// Warnings the harness emits when a hook is misconfigured or misbehaves. Absence of
// these is necessary but NOT sufficient — see the `denied` probe.
const HOOK_FAILURE_PATTERNS = [
  /Failed to load hooks from plugin/i,
  /Invalid (?:inline )?hooks config for plugin/i,
  /Hook warning:/i,
  /unknown field "hooks"/i,
]

// A path the G7 guard refuses to let a shell command write.
const FORBIDDEN_PATH = '.copilot-tracking/skraft-plans/smoke/state.json'

const log = (msg) => process.stdout.write(`${msg}\n`)

// --- throwaway Copilot home -------------------------------------------------------

// Installs through the real `copilot plugin marketplace add` + `copilot plugin install`
// flow rather than hand-writing config.json. Hand-written entries load the plugin's
// agents and skills but NOT its hooks, so a bespoke seam would silently under-report.
const installPlugin = (home, workspace) => {
  const run = (args) => {
    const result = spawnSync('copilot', args, {
      cwd: workspace,
      encoding: 'utf8',
      env: { ...process.env, COPILOT_HOME: home },
    })
    if (result.status !== 0) {
      throw new Error(`copilot ${args.join(' ')} failed: ${result.stderr || result.stdout}`)
    }
  }

  run(['plugin', 'marketplace', 'add', repoRoot, '--name', 'skraft'])
  run(['plugin', 'install', 'skraft@skraft'])

  return join(home, 'installed-plugins', 'skraft', 'skraft')
}

const prepare = () => {
  const root = mkdtempSync(join(tmpdir(), 'skraft-hook-smoke-'))
  const home = join(root, 'home')
  const workspace = join(root, 'workspace')
  for (const dir of [home, workspace]) mkdirSync(dir, { recursive: true })
  const cachePath = installPlugin(home, workspace)
  return { root, home, workspace, cachePath }
}

// --- running one probe ------------------------------------------------------------

const readLog = (logDir) => {
  if (!existsSync(logDir)) return ''
  return readdirSync(logDir)
    .map((file) => readFileSync(join(logDir, file), 'utf8'))
    .join('\n')
}

const auditEntries = (auditLog) => {
  if (!existsSync(auditLog)) return []
  return readFileSync(auditLog, 'utf8')
    .split('\n')
    .flatMap((line) => {
      if (!line.trim()) return []
      try { return [JSON.parse(line)] } catch { return [] }
    })
}

const runProbe = ({ name, prompt, env: ctx }) => {
  const logDir = join(ctx.root, `logs-${name}`)
  const auditLog = join(ctx.root, `${name}-${AUDIT_LOG}`)
  mkdirSync(logDir, { recursive: true })

  const args = ['-p', prompt, '--allow-all-tools', '--log-level', 'debug', '--log-dir', logDir]
  if (opts.model) args.push('--model', opts.model)

  const result = spawnSync('copilot', args, {
    cwd: ctx.workspace,
    encoding: 'utf8',
    env: {
      ...process.env,
      COPILOT_HOME: ctx.home,
      // Redirect the plugin's audit log per-probe; without this every probe appends
      // to the copied plugin's own logs/ and the receipts blur together.
      SKRAFT_AUDIT_LOG: auditLog,
    },
  })

  return {
    status: result.status,
    stdout: result.stdout ?? '',
    debugLog: readLog(logDir),
    audit: auditEntries(auditLog),
  }
}

// --- the probes -------------------------------------------------------------------

const probes = [
  {
    name: 'allowed',
    prompt: 'Use the bash tool to run exactly this command: echo skraft-hook-smoke. Then stop.',
    check: ({ audit, debugLog }) => {
      const failures = []
      if (audit.length === 0) {
        failures.push('no audit entry — the harness never spawned the hook command')
      }
      for (const pattern of HOOK_FAILURE_PATTERNS) {
        const hit = debugLog.match(new RegExp(`.*${pattern.source}.*`, 'i'))
        if (hit) failures.push(`harness reported a hook problem: ${hit[0].trim().slice(0, 200)}`)
      }
      return failures
    },
  },
  {
    name: 'denied',
    prompt: `Use the bash tool to run exactly this command: echo "{}" > ${FORBIDDEN_PATH}. Then stop.`,
    check: ({ audit }, ctx) => {
      const failures = []
      const denied = audit.some((entry) => entry.decision === 'DENY')
      if (!denied) failures.push('the G7 guard recorded no DENY — the forbidden write was not refused')
      if (existsSync(join(ctx.workspace, FORBIDDEN_PATH))) {
        failures.push(`${FORBIDDEN_PATH} was written — the harness did not honor the refusal`)
      }
      return failures
    },
  },
]

// --- main -------------------------------------------------------------------------

if (!spawnSync('copilot', ['--version'], { encoding: 'utf8' }).stdout) {
  log('the `copilot` CLI is not on PATH — install it or skip this check')
  process.exit(2)
}

const ctx = prepare()
log(`plugin installed into throwaway COPILOT_HOME: ${ctx.home}`)

// Lets a pipeline verify the isolation half without spending a model call.
if (opts['setup-only']) {
  log(`  plugin cache: ${ctx.cachePath}`)
  log(`  workspace:    ${ctx.workspace}`)
  log('setup-only: nothing was run')
  process.exit(0)
}

let failed = 0
try {
  for (const probe of probes) {
    const result = runProbe({ ...probe, env: ctx })
    const failures = probe.check(result, ctx)

    if (failures.length === 0) {
      log(`  PASS  ${probe.name} — ${result.audit.length} hook evaluation(s) recorded`)
      continue
    }
    failed += 1
    log(`  FAIL  ${probe.name}`)
    for (const failure of failures) log(`          ${failure}`)
    log(`        copilot exit ${result.status}; debug log kept under ${ctx.root}`)
  }
} finally {
  if (opts.keep || failed > 0) log(`artifacts kept: ${ctx.root}`)
  else rmSync(ctx.root, { recursive: true, force: true })
}

log(failed === 0 ? '\ncopilot hook smoke: every probe passed' : `\ncopilot hook smoke: ${failed} probe(s) failed`)
process.exit(failed === 0 ? 0 : 1)
