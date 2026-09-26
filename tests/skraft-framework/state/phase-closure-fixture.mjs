// Test fixture: produce what a phase must show before the state CLI lets it close —
// every required artefact written and recorded, an APPROVED review recorded for a
// reviewed phase, and for DELIVER a commit since the base mark-phase-started recorded.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { requiredTrackedOutputs } from '../../../plugins/skraft-framework/src/domain/phase-gate-policy.mjs'

export const STATE_CLI = fileURLToPath(new URL('../../../plugins/skraft-framework/src/cli/state.mjs', import.meta.url))
export const CONFIG = JSON.parse(readFileSync(new URL('../../../plugins/skraft-framework/skraft-framework.config.json', import.meta.url), 'utf8'))

const DATE = '2026-09-23'
const concrete = (pattern) => pattern.replace(/\{date\}/g, DATE).replace(/\{[^}]+\}/g, 'loyalty').replace(/\*/g, 'item')

const write = (path, content) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

// Runs the state CLI in `cwd` against `root`; throws on a non-zero exit.
export const stateCli = ({ root, cwd, env = {} }) => (...args) =>
  execFileSync('node', [STATE_CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, SKRAFT_TRACKING_ROOT: root, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

// Writes and records the phase's required artefacts, then its approved review.
export const producePhase = ({ root, slug, phase, cli }) => {
  const { specialist, reviewer } = CONFIG.phaseAgents[phase]
  for (const pattern of requiredTrackedOutputs(specialist, CONFIG)) {
    const path = concrete(pattern)
    write(join(root, slug, path), `# ${phase} artefact\n`)
    cli('record-artifact', '--slug', slug, '--phase', phase, '--path', path)
  }
  if (!reviewer) return null
  const review = `reviews/${DATE}/${phase.toLowerCase()}-review-1.md`
  write(join(root, slug, review), '```yaml\nverdict: "APPROVED"\n```\n')
  cli('record-review-artifact', '--slug', slug, '--phase', phase, '--path', review)
  cli('record-verdict', '--slug', slug, '--phase', phase, '--verdict', 'APPROVED')
  return review
}

// A git repository with one commit, for DELIVER's base.
export const gitRepo = (dir) => {
  mkdirSync(dir, { recursive: true })
  const git = (...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir, stdio: 'ignore' })
  git('init', '-q')
  git('commit', '-q', '--allow-empty', '-m', 'chore: base')
  return { commit: (message) => git('commit', '-q', '--allow-empty', '-m', message) }
}

// Closes every phase from the current one to DONE through the CLI, as the orchestrator does.
export const closeAllPhases = ({ root, slug, cli, repo }) => {
  for (const phase of CONFIG.phaseOrder) {
    cli('mark-phase-started', '--slug', slug, '--phase', phase)
    const review = producePhase({ root, slug, phase, cli })
    if (phase === 'DELIVER') repo.commit('feat(loyalty): deliver')
    if (review) cli('transition', '--slug', slug, '--to', CONFIG.phaseOrder[CONFIG.phaseOrder.indexOf(phase) + 1] ?? 'DONE')
    else cli('close-phase', '--slug', slug, '--phase', phase, '--verdict', 'APPROVED')
  }
}
