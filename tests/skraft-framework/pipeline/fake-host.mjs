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
    const metrics = { G1: { tests_total: 3, tests_passed: 3, tests_failed: 0 }, G2: { tests_total: 42, tests_passed: 42, tests_failed: 0 } }[id]
    return { id, label: id, status: 'pass', stdout_ref: `${dir}/${id}.out`, stdout_sha256: sha256(`${id} ok`), exit_code_ref: `${dir}/${id}.exit`, ...(metrics ? { metrics } : {}) }
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
//   consent:     string | null          the recorded reporting:consent answer (default 'local');
//                                       null: not recorded, so the run asks
//   adrIndex:    string                 docs/adr/decisions-index.md
//   states:      { [slug]: object | 'corrupted' }   state.json already on disk
//   backups:     { [slug]: Array<{ name, timestamp, raw }> }  state.json.bak.* on disk
//   files:       { [slug]: { [path]: string } }  tracking files already on disk
//   commits:     Array<{ sha, subject }>  recent commits, newest first (SourceControl.listRecent)
//   reportData:  { forecast?, outcome? }  report data the DISTILL / DELIVER specialist writes
//                                       where its reporting addendum says (default: none)
//   transport:   'up' | 'down'          the remote side of publication (default 'up')
export const createFakeHost = (options = {}) => {
  const tracking = new Map()
  const states = new Map(Object.entries(options.states ?? {}))
  const archived = []
  const remote = new Map() // 'pr#12' → comments, the simulated GitHub
  let nextComment = 100
  const transportCalls = []
  const repository = new Map()
  // Reporting consent is answered "local" unless a test asks for it (consent: null) or
  // gives another answer.
  const consent = options.consent === undefined ? { 'reporting:consent': 'local' } : options.consent === null ? {} : { 'reporting:consent': options.consent }
  const decisions = new Map(Object.entries({ ...consent, ...(options.decisions ?? {}) }))
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
  for (const [s, files] of Object.entries(options.files ?? {})) {
    for (const [path, text] of Object.entries(files)) writeTracking(s, path, text)
  }

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
    for (const kind of ['forecast', 'outcome']) {
      const at = prompt.match(new RegExp(`\`\\.copilot-tracking/skraft-plans/[^/]+/(reporting/[\\d-]+/${kind}-data\\.json)\``))
      if (at && options.reportData?.[kind]) writeTracking(slug, at[1], JSON.stringify(options.reportData[kind]))
    }
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
        if (states.get(s) === 'corrupted') throw Object.assign(new Error('Unexpected token'), { code: 'CORRUPTED_STATE' })
        return structuredClone(states.get(s))
      },
    },
    stateWriter: { write: async (s, state) => { states.set(s, structuredClone(state)); return Ok(undefined) } },
    stateBackups: { list: async (s) => structuredClone(options.backups?.[s] ?? []) },
    stateArchive: { setAside: async (s) => { archived.push(s); return Ok(`state.json.invalid.1`) } },
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
      listRecent: async (count) => (options.commits ?? []).slice(0, count),
      currentBranch: async () => options.branch ?? 'feature/checkout',
      remoteUrl: async () => options.remote ?? 'https://github.com/acme/shop.git',
    },
    sourceTree: {
      listFiles: async () => { scans.push(`sha${head}`); return ['src/Checkout/Payment.cs'] },
      readSource: async () => 'public sealed class Payment {}\n',
    },
    hasher: { sha256: async (text) => sha256(text), sha256Sync: (text) => sha256(text) },
    // The remote side of publication: a GitHub whose viewer is skraft-bot.
    reportTransport: {
      observe: async ({ packet }) => {
        transportCalls.push(['observe', packet.destination])
        if ((options.transport ?? 'up') === 'down') return null
        const { target } = packet
        return {
          target, branch: packet.branch, viewer: 'skraft-bot', complete: true,
          comments: structuredClone(remote.get(`${target.type}#${target.number}`) ?? []),
          capabilities: { read: true, create: true, update: true },
          provenance: { server: 'github', tool: 'issue_read' },
        }
      },
      publish: async ({ packet, decision }) => {
        transportCalls.push([decision.action, packet.destination])
        if ((options.transport ?? 'up') === 'down') return null
        const { target } = packet
        const key = `${target.type}#${target.number}`
        const comments = remote.get(key) ?? []
        let comment = comments.find((c) => c.id === decision.commentId)
        if (decision.action === 'create') {
          nextComment += 1
          comment = { id: nextComment, body: packet.body, author: 'skraft-bot', url: `https://github.com/${target.repo}/${target.type === 'pr' ? 'pull' : 'issues'}/${target.number}#issuecomment-${nextComment}` }
          remote.set(key, [...comments, comment])
        } else if (decision.action === 'update') {
          comment.body = packet.body
        }
        return {
          target, branch: packet.branch, viewer: 'skraft-bot',
          provenance: { server: 'github', tool: 'issue_read' },
          comment: structuredClone(comment),
          ...(decision.action === 'unchanged' ? {} : { writeResult: { id: comment.id } }),
        }
      },
    },
    templateReader: { read: async (path) => readFileSync(join(PLUGIN_ROOT, path), 'utf8') },
    activePipeline: { activate: async (s) => { activations.push(s) }, current: async () => activations.at(-1) ?? null },
    agentRunner: {
      run: async (dispatch) => {
        dispatches.push(dispatch)
        behave(dispatch, slug)
        // what a Copilot host reports for one dispatch (options.usage: false for a host that reports none)
        return { ok: true, text: 'done', ...(options.usage === false ? {} : { usage: { model: 'fake-model', requests: 2, inputTokens: 12000, outputTokens: 1500, cacheReadTokens: 8000, cacheWriteTokens: 0, credits: 1.25 } }) }
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
      // also on disk, as tracking-decision-store.mjs writes it
      write: async (s, k, answer, by = 'human') => {
        decisions.set(k, answer)
        writeTracking(s, `decisions/${String(k).replace(/[^A-Za-z0-9._-]+/g, '_')}.json`, JSON.stringify({ key: k, answer, by, at: `${TODAY}T10:00:00.000Z` }))
      },
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
    archived,
    remote,
    transportCalls,
    state: (slug) => states.get(slug),
    tracking: (slug, path) => tracking.get(key(slug, path)),
    repository,
    agentsCalled: () => dispatches.map((d) => d.agent),
  }
}
