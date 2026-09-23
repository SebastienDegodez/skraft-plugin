// Acceptance — a fresh pipeline walks the published phase order to DONE through the
// state CLI alone, exactly as the orchestrator drives it. The phase order is read
// from skraft-framework.config.json, never from a constant in the state machine.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { CONFIG as FIXTURE_CONFIG, closeAllPhases, gitRepo, producePhase, stateCli as fixtureCli } from './phase-closure-fixture.mjs'

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

test('closing every published phase, each with its evidence, reaches DONE', async () => {
  await withTrackingRoot(async (root) => {
    const repo = join(root, 'repo')
    const commits = gitRepo(repo)
    const cli = fixtureCli({ root, cwd: repo })
    cli('init', '--slug', 'demo')
    closeAllPhases({ root, slug: 'demo', cli, repo: commits })

    const state = JSON.parse(await readFile(join(root, 'demo', 'state.json'), 'utf8'))
    assert.equal(state.currentPhase, 'DONE')
    assert.deepEqual(state.phasesCompleted, FIXTURE_CONFIG.phaseOrder)
  })
})

test('a phase with nothing recorded cannot close, and the refusal names what is missing', async () => {
  await withTrackingRoot(async (root) => {
    const env = { SKRAFT_TRACKING_ROOT: root }
    await stateCli(['init', '--slug', 'demo'], env)
    const refused = await stateCli(['close-phase', '--slug', 'demo', '--phase', 'RESEARCH', '--verdict', 'APPROVED'], env)
    assert.equal(refused.exitCode, 1)
    assert.match(refused.stderr, /PHASE_GATE/)
    assert.match(refused.stderr, /ARTIFACT_MISSING — RESEARCH recorded no artefact matching research\/\{date\}\/\{slug\}-research\.md/)
    const state = JSON.parse(await readFile(join(root, 'demo', 'state.json'), 'utf8'))
    assert.equal(state.currentPhase, 'RESEARCH', 'a refused closure leaves the state untouched')
  })
})

test('the reviewer loop advances only on the latest review, once it approves', async () => {
  await withTrackingRoot(async (root) => {
    const cli = fixtureCli({ root })
    cli('init', '--slug', 'demo')
    producePhase({ root, slug: 'demo', phase: 'RESEARCH', cli })
    cli('close-phase', '--slug', 'demo', '--phase', 'RESEARCH', '--verdict', 'APPROVED')

    await mkdir(join(root, 'demo', 'reviews', '2026-09-22'), { recursive: true })
    await writeFile(join(root, 'demo', 'reviews', '2026-09-22', 'design-review-0.md'), 'verdict: "NEEDS_REWORK"\n')
    cli('record-review-artifact', '--slug', 'demo', '--phase', 'DESIGN', '--path', 'reviews/2026-09-22/design-review-0.md')
    cli('record-verdict', '--slug', 'demo', '--phase', 'DESIGN', '--verdict', 'CHANGES_REQUESTED')
    const env = { SKRAFT_TRACKING_ROOT: root }
    assert.notEqual((await stateCli(['transition', '--slug', 'demo', '--to', 'DISTILL'], env)).exitCode, 0)

    producePhase({ root, slug: 'demo', phase: 'DESIGN', cli })
    const advanced = await stateCli(['transition', '--slug', 'demo', '--to', 'DISTILL'], env)
    assert.equal(advanced.exitCode, 0, advanced.stderr)
    assert.equal(advanced.out.currentPhase, 'DISTILL')
  })
})

test('a recorded verdict that its review file contradicts cannot advance', async () => {
  await withTrackingRoot(async (root) => {
    const cli = fixtureCli({ root })
    cli('init', '--slug', 'demo')
    producePhase({ root, slug: 'demo', phase: 'RESEARCH', cli })
    cli('close-phase', '--slug', 'demo', '--phase', 'RESEARCH', '--verdict', 'APPROVED')
    const review = producePhase({ root, slug: 'demo', phase: 'DESIGN', cli })
    await writeFile(join(root, 'demo', review), 'verdict: "NEEDS_REWORK"\n')

    const refused = await stateCli(['transition', '--slug', 'demo', '--to', 'DISTILL'], { SKRAFT_TRACKING_ROOT: root })
    assert.equal(refused.exitCode, 1)
    assert.match(refused.stderr, /VERDICT_MISMATCH/)
  })
})

test('DELIVER cannot close without a commit since its recorded base', async () => {
  await withTrackingRoot(async (root) => {
    const repo = join(root, 'repo')
    gitRepo(repo)
    const cli = fixtureCli({ root, cwd: repo })
    cli('init', '--slug', 'demo')
    for (const phase of ['RESEARCH', 'DESIGN', 'DISTILL']) {
      const review = producePhase({ root, slug: 'demo', phase, cli })
      if (review) cli('transition', '--slug', 'demo', '--to', FIXTURE_CONFIG.phaseOrder[FIXTURE_CONFIG.phaseOrder.indexOf(phase) + 1])
      else cli('close-phase', '--slug', 'demo', '--phase', phase, '--verdict', 'APPROVED')
    }
    cli('mark-phase-started', '--slug', 'demo', '--phase', 'DELIVER')
    producePhase({ root, slug: 'demo', phase: 'DELIVER', cli })

    assert.throws(() => cli('transition', '--slug', 'demo', '--to', 'DONE'), /NO_COMMIT/)
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

const git = (cwd, ...args) => execFileAsync('git', args, { cwd })

test('set writes an orchestrator-owned field and rejects invariant fields', async () => {
  await withTrackingRoot(async (root) => {
    const env = { SKRAFT_TRACKING_ROOT: root }
    await stateCli(['init', '--slug', 'demo'], env)

    const set = await stateCli(['set', '--slug', 'demo', '--field', 'nextActions', '--data', '["confirm the story"]'], env)
    assert.equal(set.exitCode, 0, set.stderr)
    const state = JSON.parse(await readFile(join(root, 'demo', 'state.json'), 'utf8'))
    assert.deepEqual(state.nextActions, ['confirm the story'])

    const refused = await stateCli(['set', '--slug', 'demo', '--field', 'currentPhase', '--data', '"DONE"'], env)
    assert.equal(refused.exitCode, 1)
    assert.match(refused.stderr, /IMMUTABLE_FIELD/)

    const malformed = await stateCli(['set', '--slug', 'demo', '--field', 'nextActions', '--data', '[oops'], env)
    assert.equal(malformed.exitCode, 1)
    assert.match(malformed.stderr, /INVALID_ARGUMENT/)
  })
})

test('mark-phase-started records the base commit, and closing the phase records its completion', async () => {
  await withTrackingRoot(async (root) => {
    const repo = join(root, 'repo')
    await execFileAsync('mkdir', ['-p', repo])
    await git(repo, 'init', '-q')
    await git(repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'chore: base')
    const { stdout: head } = await git(repo, 'rev-parse', 'HEAD')

    const env = { SKRAFT_TRACKING_ROOT: root }
    const inRepo = async (args) => {
      try {
        const { stdout } = await execFileAsync('node', [CLI, ...args], { cwd: repo, env: { ...process.env, ...env } })
        return { exitCode: 0, out: JSON.parse(stdout) }
      } catch (err) {
        return { exitCode: err.code ?? 1, stderr: err.stderr }
      }
    }
    await inRepo(['init', '--slug', 'demo'])
    producePhase({ root, slug: 'demo', phase: 'RESEARCH', cli: fixtureCli({ root, cwd: repo }) })
    const started = await inRepo(['mark-phase-started', '--slug', 'demo', '--phase', 'RESEARCH'])
    assert.equal(started.exitCode, 0, started.stderr)
    assert.equal(started.out.phaseHistory.RESEARCH.status, 'inProgress')
    assert.equal(started.out.phaseHistory.RESEARCH.baseSha, head.trim())

    const closed = await inRepo(['close-phase', '--slug', 'demo', '--phase', 'RESEARCH', '--verdict', 'APPROVED'])
    assert.equal(closed.out.phaseHistory.RESEARCH.status, 'done')
    assert.ok(closed.out.phaseHistory.RESEARCH.completedAt)
  })
})
