// In-memory doubles of every RunPipeline driven port: plain dictionaries and queues, no
// mock library (testing doctrine). The "LLM" is the AgentRunner double: scripted agents
// that leave on disk what a real subagent would.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Ok } from '../../../plugins/skraft-framework/src/domain/result.mjs'
import { requiredTrackedOutputs } from '../../../plugins/skraft-framework/src/domain/phase-gate-policy.mjs'

const here = dirname(fileURLToPath(import.meta.url))
export const PLUGIN_ROOT = join(here, '../../../plugins/skraft-framework')
export const CONFIG = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'skraft-framework.config.json'), 'utf8'))
export const TODAY = '2026-10-05'

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

const sha256 = (text) => createHash('sha256').update(text).digest('hex')

// The quality-gates evidence a DELIVER engineer leaves: the log and every file it cites.
// outcome 'pass' — a log every claim of which checks out; 'fail' — G1 records a failure;
// 'inconclusive' — G1's captured stdout is not on disk.
export const evidenceOf = (outcome, rev) => {
  const dir = `evidence/${TODAY}/s1`
  const files = {}
  const gates = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'].map((id) => {
    files[`${dir}/${id}.out`] = `${id} ok`
    files[`${dir}/${id}.exit`] = '0'
    return { id, label: id, status: 'pass', stdout_ref: `${dir}/${id}.out`, stdout_sha256: sha256(`${id} ok`), exit_code_ref: `${dir}/${id}.exit` }
  })
  files[`${dir}/G7.out`] = ''
  gates.push(
    { id: 'G7', label: 'no mocks', status: 'pass', stdout_ref: `${dir}/G7.out`, stdout_sha256: sha256('') },
    { id: 'G8', label: 'commits', status: 'pass' },
    { id: 'G9', label: 'test integrity', status: 'pass' },
  )
  if (outcome === 'fail') gates[0].status = 'fail'
  if (outcome === 'inconclusive') delete files[`${dir}/G1.out`]
  const log = {
    $schema: 'quality-gates-evidence/v1', story: 's1', produced_at: `${TODAY}T10:00:00Z`, tech_adapter: 'dotnet',
    repo_root_rev: rev, commits_covered: [], gates, test_integrity: { cycles: [] },
  }
  return { [`${dir}/qg-s1.json`]: JSON.stringify(log), ...files }
}

export const ADR_INDEX_HEADER = '| ADR | Title | Status | Chosen | Decision (1 line) | Ratified by | Date |\n|---|---|---|---|---|---|---|\n'

// options:
//   verdicts:    { [phase]: string[] }  review verdicts a reviewer writes, in order (default APPROVED)
//   reviews:     { [phase]: string[] }  full review bodies instead of plain verdicts
//   skipOutputs: { [agent]: number }    first N dispatches of that agent write nothing
//   gates:       string[]               evidence each DELIVER engineer leaves: 'pass' | 'fail' |
//                                       'inconclusive', in order (default 'pass'); see evidenceOf
//   answers:     { [keyPrefix]: (string|null)[] }  HumanInteraction answers by key prefix
//   decisions:   { [key]: string }      answers already recorded in the DecisionStore
//   adrIndex:    string                 docs/adr/decisions-index.md
export const createFakeHost = (options = {}) => {
  const tracking = new Map()
  const states = new Map()
  const repository = new Map()
  const decisions = new Map(Object.entries(options.decisions ?? {}))
  if (options.adrIndex) repository.set('docs/adr/decisions-index.md', options.adrIndex)
  let head = 1
  const dispatches = []
  const ranges = []
  const scans = []
  const questions = []
  const logs = []
  const phases = []
  const activations = []
  const counters = {}
  const take = (queue, fallback) => (queue && queue.length > 0 ? queue.shift() : fallback)
  const verdictQueues = Object.fromEntries(Object.entries(options.verdicts ?? {}).map(([k, v]) => [k, [...v]]))
  const reviewQueues = Object.fromEntries(Object.entries(options.reviews ?? {}).map(([k, v]) => [k, [...v]]))
  const gates = [...(options.gates ?? [])]
  const answers = Object.fromEntries(Object.entries(options.answers ?? {}).map(([k, v]) => [k, [...v]]))
  const key = (slug, path) => `${slug}::${path}`
  const writeTracking = (slug, path, text) => tracking.set(key(slug, path), text)
  const prefix = (slug) => `.copilot-tracking/skraft-plans/${slug}/`

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
    if (agent === CONFIG.phaseAgents.DELIVER.specialist) {
      head += 1
      for (const [path, text] of Object.entries(evidenceOf(take(gates, 'pass'), `sha${head}`))) writeTracking(slug, path, text)
    }
  }

  // Every driven port of RunPipeline (ports/infrastructure/), in memory.
  const dependencies = (slug) => ({
    config: CONFIG,
    stateReader: {
      read: async (s) => {
        if (!states.has(s)) throw Object.assign(new Error('absent'), { code: 'ENOENT' })
        return structuredClone(states.get(s))
      },
    },
    stateWriter: { write: async (s, state) => { states.set(s, structuredClone(state)); return Ok(undefined) } },
    trackingStore: {
      exists: async (s, path) => tracking.has(key(s, path)),
      read: async (s, path) => {
        if (!tracking.has(key(s, path))) throw Object.assign(new Error('absent'), { code: 'ENOENT' })
        return tracking.get(key(s, path))
      },
      list: async (s) => [...tracking.keys()].filter((k) => k.startsWith(`${s}::`)).map((k) => k.slice(s.length + 2)),
      write: async (s, path, text) => writeTracking(s, path, text),
      prefix,
    },
    // The repository: its own files, and the tracking directory under it.
    repositoryReader: {
      read: async (path) => {
        const tracked = path.match(/^\.copilot-tracking\/skraft-plans\/([^/]+)\/(.+)$/)
        if (tracked) return tracking.get(key(tracked[1], tracked[2])) ?? null
        return repository.get(path) ?? null
      },
    },
    // Commits are sha1, sha2, … — HEAD moves when the DELIVER engineer commits.
    sourceControl: {
      headSha: async () => `sha${head}`,
      head: async () => `sha${head}`,
      parentOf: async () => null,
      filesOf: async () => [],
      commit: async (sha) => (/^sha\d+$/.test(sha ?? '') ? { exists: true, subject: 'feat(checkout): pay', message: 'feat(checkout): pay\n\nSigned-off-by: E <e@x>', files: [] } : { exists: false }),
      range: async (base, rev) => { ranges.push({ base, rev }); return [] },
      show: async () => null,
      listRecent: async () => [],
    },
    sourceTree: {
      listFiles: async () => { scans.push(`sha${head}`); return ['src/Checkout/Payment.cs'] },
      readSource: async () => 'public sealed class Payment {}\n',
    },
    hasher: { sha256: async (text) => sha256(text) },
    activePipeline: { activate: async (s) => { activations.push(s) } },
    agentRunner: {
      run: async (dispatch) => {
        dispatches.push(dispatch)
        behave(dispatch, slug)
        return { ok: true, text: 'done' }
      },
    },
    humanInteraction: {
      ask: async (checkpoint) => {
        questions.push(checkpoint)
        const match = Object.keys(answers).find((p) => checkpoint.key.startsWith(p))
        return match ? take(answers[match], null) : null
      },
    },
    decisionStore: {
      read: async (s, k) => decisions.get(k) ?? null,
      write: async (s, k, answer) => { decisions.set(k, answer) },
    },
    progress: { phase: (t) => phases.push(t), log: (m) => logs.push(m) },
    time: { now: () => new Date(`${TODAY}T10:00:00.000Z`), isoString: () => `${TODAY}T10:00:00.000Z` },
  })

  return {
    dependencies,
    dispatches,
    ranges,
    scans,
    questions,
    decisions,
    logs,
    phases,
    activations,
    state: (slug) => states.get(slug),
    tracking: (slug, path) => tracking.get(key(slug, path)),
    repository,
    agentsCalled: () => dispatches.map((d) => d.agent),
  }
}
