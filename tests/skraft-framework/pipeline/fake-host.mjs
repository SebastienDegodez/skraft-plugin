// In-memory host for the run-pipeline use case: plain dictionaries, no mock library
// (testing doctrine: InMemory doubles only). The "LLM" is simulated by scripted agents
// that write what a real subagent would leave on disk.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Ok } from '../../../plugins/skraft-framework/src/domain/result.mjs'
import { requiredTrackedOutputs } from '../../../plugins/skraft-framework/src/domain/phase-gate-policy.mjs'

const here = dirname(fileURLToPath(import.meta.url))
export const PLUGIN_ROOT = join(here, '../../../plugins/skraft-framework')
export const CONFIG = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'skraft-framework.config.json'), 'utf8'))
export const TODAY = '2026-10-05'

const RESEARCHER = CONFIG.phaseAgents.RESEARCH.specialist
const ARCHITECT = CONFIG.phaseAgents.DESIGN.specialist
const ENGINEER = CONFIG.phaseAgents.DELIVER.specialist

// A concrete path for a descriptor pattern, as an agent would choose it.
export const concretePath = (pattern, slug) => pattern
  .replace(/\{date\}/g, TODAY)
  .replace(/\{slug\}/g, slug)
  .replace(/\{story\}/g, 's1')
  .replace(/\{N\}/g, '1')
  .replace(/\{[^}]+\}/g, 'x')
  .replace(/\*/g, 'x')

export const review = (verdict, { escalation, findings = '' } = {}) => [
  '<!-- markdownlint-disable-file -->',
  '```yaml',
  `verdict: "${verdict}"`,
  ...(escalation ? [`escalation: "${escalation}"`] : []),
  'lenses: []',
  '```',
  findings,
].join('\n')

export const ADR_INDEX_HEADER = '| ADR | Title | Status | Chosen | Decision (1 line) | Ratified by | Date |\n|---|---|---|---|---|---|---|\n'

// options:
//   verdicts:   { [phase]: string[] } — review verdicts a reviewer writes, in order (default APPROVED)
//   reviews:    { [phase]: string[] } — full review bodies instead of plain verdicts
//   skipOutputs:{ [agent]: number }   — first N dispatches of that agent write nothing
//   qgExits:    number[]              — qg-verify exit codes, in order (default 0)
//   answers:    { [keyPrefix]: (string|null)[] } — human answers by checkpoint key prefix
//   adrIndex:   string                — docs/adr/decisions-index.md
export const createFakeHost = (options = {}) => {
  const tracking = new Map()
  const states = new Map()
  const repository = new Map()
  if (options.adrIndex) repository.set('docs/adr/decisions-index.md', options.adrIndex)
  let head = 1
  const dispatches = []
  const commands = []
  const checkpoints = []
  const logs = []
  const phases = []
  const counters = {}
  const take = (queue, fallback) => (queue && queue.length > 0 ? queue.shift() : fallback)
  const verdictQueues = Object.fromEntries(Object.entries(options.verdicts ?? {}).map(([k, v]) => [k, [...v]]))
  const reviewQueues = Object.fromEntries(Object.entries(options.reviews ?? {}).map(([k, v]) => [k, [...v]]))
  const qgExits = [...(options.qgExits ?? [])]
  const answers = Object.fromEntries(Object.entries(options.answers ?? {}).map(([k, v]) => [k, [...v]]))

  const key = (slug, path) => `${slug}::${path}`
  const writeTracking = (slug, path, text) => tracking.set(key(slug, path), text)

  // The simulated LLM.
  const behave = ({ agent, role, phase, prompt }, slug) => {
    counters[agent] = (counters[agent] ?? 0) + 1
    if (role === 'reviewer') {
      const out = prompt.match(/`\.copilot-tracking\/skraft-plans\/[^/]+\/(reviews\/[^`]+)`/)
      const body = take(reviewQueues[phase], null) ?? review(take(verdictQueues[phase], 'APPROVED'))
      if (out) writeTracking(slug, out[1], body)
      return
    }
    if (prompt.includes('Ratify mode')) {
      const index = repository.get('docs/adr/decisions-index.md') ?? ''
      const rejectAll = /: reject/.test(prompt)
      repository.set('docs/adr/decisions-index.md', index.replace(/\| Proposed \|/g, rejectAll ? '| Rejected |' : '| Accepted |'))
      return
    }
    if ((options.skipOutputs?.[agent] ?? 0) >= counters[agent]) return
    for (const pattern of requiredTrackedOutputs(agent, CONFIG)) {
      writeTracking(slug, concretePath(pattern, slug), `# ${agent} output`)
    }
    if (agent === ENGINEER) head += 1
  }

  const ports = (slug) => ({
    config: CONFIG,
    pluginRoot: '/plugin',
    trackingPrefix: (s) => `.copilot-tracking/skraft-plans/${s}/`,
    stateReader: {
      read: async (s) => {
        if (!states.has(s)) throw Object.assign(new Error('absent'), { code: 'ENOENT' })
        return structuredClone(states.get(s))
      },
    },
    stateWriter: { write: async (s, state) => { states.set(s, structuredClone(state)); return Ok(state) } },
    trackingFiles: {
      exists: async (s, path) => tracking.has(key(s, path)),
      read: async (s, path) => {
        if (!tracking.has(key(s, path))) throw Object.assign(new Error('absent'), { code: 'ENOENT' })
        return tracking.get(key(s, path))
      },
      list: async (s) => [...tracking.keys()].filter((k) => k.startsWith(`${s}::`)).map((k) => k.slice(s.length + 2)),
      write: async (s, path, text) => writeTracking(s, path, text),
    },
    repositoryFiles: { read: async (path) => repository.get(path) ?? null },
    git: { headSha: async () => `sha${head}` },
    agents: {
      run: async (dispatch) => {
        dispatches.push(dispatch)
        behave(dispatch, slug)
        return { ok: true, text: 'done' }
      },
    },
    commands: {
      run: async (argv) => {
        commands.push(argv)
        if (argv[1].endsWith('structural-scan.mjs')) {
          const out = argv[argv.indexOf('--out') + 1].replace(/^\.copilot-tracking\/skraft-plans\/[^/]+\//, '')
          writeTracking(slug, out, '{}')
          return { exitCode: 0, stdout: '', stderr: '' }
        }
        if (argv[1].endsWith('qg-verify.mjs')) {
          const exitCode = take(qgExits, 0)
          return { exitCode, stdout: exitCode === 0 ? '{"verdict":"pass"}' : `{"verdict":"${exitCode === 1 ? 'fail' : 'inconclusive'}","findings":["G6 mutation 92%"]}`, stderr: '' }
        }
        return { exitCode: 127, stdout: '', stderr: 'unknown command' }
      },
    },
    interaction: {
      decide: async (checkpoint) => {
        checkpoints.push(checkpoint)
        const prefix = Object.keys(answers).find((p) => checkpoint.key.startsWith(p))
        return prefix ? take(answers[prefix], null) : null
      },
    },
    progress: { phase: (t) => phases.push(t), log: (m) => logs.push(m) },
    clock: { today: () => TODAY, now: () => `${TODAY}T10:00:00.000Z` },
  })

  return {
    ports,
    dispatches,
    commands,
    checkpoints,
    logs,
    phases,
    state: (slug) => states.get(slug),
    tracking: (slug, path) => tracking.get(key(slug, path)),
    repository,
    agentsCalled: () => dispatches.map((d) => d.agent),
    names: { RESEARCHER, ARCHITECT, ENGINEER },
  }
}
