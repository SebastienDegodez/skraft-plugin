// Acceptance — a fresh pipeline walks the published phase order to DONE through the
// state CLI alone, exactly as the orchestrator drives it. The phase order is read
// from skraft-framework.config.json, never from a constant in the state machine.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const CLI = fileURLToPath(new URL('../../../plugins/skraft-framework/src/cli/state.mjs', import.meta.url))
const PUBLISHED_CONFIG = fileURLToPath(new URL('../../../plugins/skraft-framework/skraft-framework.config.json', import.meta.url))

const stateCli = async (args, env) => {
  try {
    const { stdout } = await execFileAsync('node', [CLI, ...args], { env: { ...process.env, ...env } })
    return { exitCode: 0, out: stdout.trim() ? JSON.parse(stdout) : null, stderr: '' }
  } catch (err) {
    return { exitCode: err.code ?? 1, out: null, stderr: err.stderr ?? '' }
  }
}

const withTrackingRoot = async (fn) => {
  const root = await mkdtemp(join(tmpdir(), 'skraft-walk-'))
  try { await fn(root) } finally { await rm(root, { recursive: true, force: true }) }
}

test('a fresh pipeline starts at the first published phase and records its slug', async () => {
  await withTrackingRoot(async (root) => {
    const { phaseOrder } = JSON.parse(await readFile(PUBLISHED_CONFIG, 'utf8'))
    const init = await stateCli(['init', '--slug', 'demo'], { SKRAFT_TRACKING_ROOT: root })
    assert.equal(init.exitCode, 0, init.stderr)
    const state = JSON.parse(await readFile(join(root, 'demo', 'state.json'), 'utf8'))
    assert.equal(state.currentPhase, phaseOrder[0])
    assert.equal(state.projectSlug, 'demo')
  })
})

test('closing every published phase in order reaches DONE', async () => {
  await withTrackingRoot(async (root) => {
    const env = { SKRAFT_TRACKING_ROOT: root }
    const { phaseOrder } = JSON.parse(await readFile(PUBLISHED_CONFIG, 'utf8'))
    assert.equal((await stateCli(['init', '--slug', 'demo'], env)).exitCode, 0)

    for (const [index, phase] of phaseOrder.entries()) {
      const closed = await stateCli(['close-phase', '--slug', 'demo', '--phase', phase, '--verdict', 'APPROVED'], env)
      assert.equal(closed.exitCode, 0, `close-phase ${phase}: ${closed.stderr}`)
      assert.equal(closed.out.currentPhase, phaseOrder[index + 1] ?? 'DONE')
    }

    const state = JSON.parse(await readFile(join(root, 'demo', 'state.json'), 'utf8'))
    assert.deepEqual(state.phasesCompleted, phaseOrder)
  })
})

test('the reviewer loop of a phase advances with record-verdict then transition', async () => {
  await withTrackingRoot(async (root) => {
    const env = { SKRAFT_TRACKING_ROOT: root }
    const [first, second, third] = JSON.parse(await readFile(PUBLISHED_CONFIG, 'utf8')).phaseOrder
    await stateCli(['init', '--slug', 'demo'], env)
    await stateCli(['close-phase', '--slug', 'demo', '--phase', first, '--verdict', 'APPROVED'], env)

    const rework = await stateCli(['record-verdict', '--slug', 'demo', '--phase', second, '--verdict', 'CHANGES_REQUESTED'], env)
    assert.equal(rework.exitCode, 0, rework.stderr)
    const refused = await stateCli(['transition', '--slug', 'demo', '--to', third], env)
    assert.notEqual(refused.exitCode, 0)

    await stateCli(['record-verdict', '--slug', 'demo', '--phase', second, '--verdict', 'APPROVED'], env)
    const advanced = await stateCli(['transition', '--slug', 'demo', '--to', third], env)
    assert.equal(advanced.exitCode, 0, advanced.stderr)
    assert.equal(advanced.out.currentPhase, third)
  })
})

test('the phase order comes from the framework config the CLI is pointed at', async () => {
  await withTrackingRoot(async (root) => {
    const configPath = join(root, 'skraft-framework.config.json')
    await writeFile(configPath, JSON.stringify({ phaseOrder: ['ALPHA', 'OMEGA'] }), 'utf8')
    const env = { SKRAFT_TRACKING_ROOT: root, SKRAFT_CONFIG: configPath }

    const init = await stateCli(['init', '--slug', 'demo'], env)
    assert.equal(init.out.currentPhase, 'ALPHA')
    const closed = await stateCli(['close-phase', '--slug', 'demo', '--phase', 'ALPHA', '--verdict', 'APPROVED'], env)
    assert.equal(closed.out.currentPhase, 'OMEGA')
  })
})
