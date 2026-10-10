// `claude plugin test plugins/skraft-framework` — the mod driven end to end inside the
// engine's own runtime. The test's hooks stand for the engine beneath the mod: a file
// system in a dictionary, processes answered by name, and subagents that "write" their
// artefacts (the simulated LLM). A two-phase config keeps the scenario short.
import { describe, expect, mock, test } from 'claude-code/testing'

const CWD = '/work'
const TRACK = `${CWD}/.copilot-tracking/skraft-plans/checkout`
const TODAY = new Date().toISOString().slice(0, 10)
const tracked = (pattern: string) => `.copilot-tracking/skraft-plans/{projectSlug}/${pattern}`

const CONFIG = {
  phaseOrder: ['RESEARCH', 'DESIGN'],
  phaseAgents: {
    RESEARCH: { specialist: 'Skraft - Solution Researcher', reviewer: null },
    DESIGN: { specialist: 'Skraft - Solution Architect', reviewer: 'Skraft - Solution Architect Reviewer' },
  },
  agentAliases: {
    'solution-researcher': 'Skraft - Solution Researcher',
    'Skraft - Solution Researcher': 'Skraft - Solution Researcher',
    'solution-architect': 'Skraft - Solution Architect',
    'Skraft - Solution Architect': 'Skraft - Solution Architect',
    'solution-architect-reviewer': 'Skraft - Solution Architect Reviewer',
    'Skraft - Solution Architect Reviewer': 'Skraft - Solution Architect Reviewer',
  },
  agentArtifacts: {
    'Skraft - Solution Researcher': { inputs: [], outputs: [tracked('research/{date}/{slug}-research.md')] },
    'Skraft - Solution Architect': {
      inputs: [tracked('research/{date}/{slug}-research.md')],
      outputs: [tracked('details/{date}/contracts-{story}.md')],
    },
    'Skraft - Solution Architect Reviewer': { inputs: [], outputs: [tracked('reviews/{date}/design-review-{N}.md')] },
  },
  agentContext: {},
  agentDispatchers: {},
}

type Spawn = { prompt: string; subagentType?: string }

const world = ($: any, on: any, { reviewVerdict = 'APPROVED' } = {}) => {
  const files = new Map<string, string>()
  const spawns: Spawn[] = []
  const processes: string[][] = []
  let head = 1
  let nextAgent = 0
  files.set('/plugin/skraft-framework.config.json', JSON.stringify(CONFIG))

  on('session.start', ($$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', ($$: any, e: any) => ({ value: { command: e.name } }))
  on('tool.register', ($$: any, e: any) => ({ value: { tool: `mcp__skraft__${e.name}` } }))
  on('ui.open', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: CWD }))
  on('session.surfaces', () => ({ value: [] })) // headless: no dialog, checkpoints wait
  on('env.get', () => ({ value: undefined }))
  on('fs.exists', ($$: any, e: any) => ({ value: files.has(e.path) }))
  on('fs.read', ($$: any, e: any) => {
    if (!files.has(e.path) && e.path.endsWith('skraft-framework.config.json')) return { value: JSON.stringify(CONFIG) }
    // The plugin's review-verdict template, as assets/templates/review-verdict.template.md has it
    if (!files.has(e.path) && e.path.endsWith('/assets/templates/review-verdict.template.md')) {
      return { value: '<!-- markdownlint-disable-file -->\n# Review verdict\n\n```yaml\n{{payload}}\n```\n' }
    }
    if (!files.has(e.path)) return { deny: `ENOENT ${e.path}` }
    return { value: files.get(e.path) }
  })
  on('fs.write', ($$: any, e: any) => { files.set(e.path, e.text); return { value: undefined } })
  on('fs.list', ($$: any, e: any) => {
    const prefix = `${e.path.replace(/\/$/, '')}/`
    const names = new Map<string, 'file' | 'dir'>()
    for (const path of files.keys()) {
      if (!path.startsWith(prefix)) continue
      const [first, ...rest] = path.slice(prefix.length).split('/')
      names.set(first, rest.length > 0 ? 'dir' : 'file')
    }
    return { value: [...names].map(([name, kind]) => ({ name, kind, size: 0 })) }
  })
  // Only git reaches a process: the state, the evidence check and the scan run in the mod.
  on('process.run', ($$: any, e: any) => {
    const [cmd, sub] = e.argv
    const ok = (stdout = '') => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (cmd === 'git' && sub === 'rev-parse') return ok(`sha${head}\n`)
    if (cmd === 'git' && sub === 'ls-files') return ok('')
    if (cmd === 'git' && sub === 'symbolic-ref') return ok('feature/checkout\n')
    if (cmd === 'git' && sub === 'remote') return { value: { exitCode: 2, stdout: '', stderr: 'no origin', isStdoutTruncated: false, isStderrTruncated: false } }
    processes.push(e.argv)
    return { value: { exitCode: 127, stdout: '', stderr: 'unknown', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  // The simulated LLM: each subagent leaves its artefacts, then its turn completes.
  on('agent.spawn', ($$: any, e: any) => {
    // Beneath the plugins the spawn arrives as the Agent tool's own input (subagent_type).
    const type = e.subagentType ?? e.subagent_type
    spawns.push({ prompt: e.prompt, subagentType: type })
    const agentId = `agent-${++nextAgent}`
    if (type === 'skraft:solution-researcher') files.set(`${TRACK}/research/${TODAY}/checkout-research.md`, '# research')
    if (type === 'skraft:solution-architect') { files.set(`${TRACK}/details/${TODAY}/contracts-s1.md`, '# contracts'); head += 1 }
    if (type === 'skraft:solution-architect-reviewer') {
      const out = e.prompt.match(/`(\.copilot-tracking\/skraft-plans\/checkout\/reviews\/[^`]+)`/)
      if (out) files.set(`${CWD}/${out[1]}`, `\`\`\`yaml\nverdict: "${reviewVerdict}"\n\`\`\``)
    }
    Promise.resolve().then(() => $.turn.complete({ agentId, answer: 'done', reason: 'answer', durationMs: 1, isAborted: false, turnId: `t-${agentId}` }))
    return { model: 'test', agentId }
  })
  on('turn.complete', () => ({ text: '' }))
  return { files, spawns, processes }
}

const runPipeline = async ($: any, clock: any) => {
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: CWD } as any)
  const started = await $.command.run({ command: 'skraft', args: 'checkout #42 Pay by card' } as any)
  for (let i = 0; i < 40; i += 1) await clock.settle()
  return started
}

describe('skraft mod', () => {
  test('runs the configured phases through the generic use case and records them in state.json', { timeoutMs: 20_000 } as any, async ($, on) => {
    const clock = mock.clock(on)
    const { files, spawns, processes } = world($, on)
    const started = await runPipeline($, clock)

    expect(started.text).toMatch(/skraft checkout started/)
    expect(spawns.map((s) => s.subagentType)).toEqual([
      'skraft:solution-researcher',
      'skraft:solution-architect',
      'skraft:solution-architect-reviewer',
    ])
    expect(spawns[1].prompt).toMatch(/#42 — Pay by card/)
    const state = JSON.parse(files.get(`${TRACK}/state.json`) ?? '{}')
    expect(state.currentPhase).toBe('DONE')
    expect(state.phasesCompleted).toEqual(['RESEARCH', 'DESIGN'])
    expect(state.phaseArtifacts.RESEARCH).toContain(`details/${TODAY}/structural-scan.json`)
    // the settings hooks guard this run
    expect(files.get(`${CWD}/.copilot-tracking/skraft-plans/.active-slug`)).toBe('checkout\n')
    expect(spawns.every((s) => s.prompt.startsWith('## Skraft dispatch — '))).toBe(true)
    // the scan ran in the mod; the state was written with $.fs, one backup per phase change
    expect(JSON.parse(files.get(`${TRACK}/details/${TODAY}/structural-scan.json`) ?? '{}').revision).toBe('sha1')
    expect(processes).toEqual([])
    const backups = [...files.keys()].filter((path) => /\/state\.json\.bak\.\d+$/.test(path))
    expect(backups.length).toBeGreaterThan(0)
    expect(backups.length).toBeLessThanOrEqual(3)
  })

  test('a rejected phase with nobody to ask stops as awaiting-human and keeps the key', { timeoutMs: 20_000 } as any, async ($, on) => {
    const clock = mock.clock(on)
    const { files } = world($, on, { reviewVerdict: 'REJECTED' })
    await runPipeline($, clock)

    const status = await $.command.run({ command: 'skraft', args: '' } as any)
    expect(status.text).toMatch(/skraft checkout: awaiting-human at DESIGN/)
    const state = JSON.parse(files.get(`${TRACK}/state.json`) ?? '{}')
    expect(state.currentPhase).toBe('DESIGN')
    expect(state.verdicts.DESIGN).toBe('CHANGES_REQUESTED')
  })

  test('/skraft decide records an answer, /skraft close closes the open phase by human validation', { timeoutMs: 20_000 } as any, async ($, on) => {
    const clock = mock.clock(on)
    const { files } = world($, on, { reviewVerdict: 'REJECTED' })
    await runPipeline($, clock)
    const status = await $.command.run({ command: 'skraft', args: '' } as any)
    const key = 'rejected:DESIGN:1'
    expect(status.text).toMatch(/awaiting-human/)

    const elsewhere = await $.command.run({ command: 'skraft', args: `decide refund ${key} stop` } as any)
    expect(elsewhere.text).toMatch(/^Refused: "refund" is not the pipeline of this working copy: \.active-slug names "checkout"/)
    const decided = await $.command.run({ command: 'skraft', args: `decide checkout ${key} stop` } as any)
    expect(decided.text).toMatch(new RegExp(`Recorded "stop" for ${key}`))
    expect([...files.keys()].some((path) => path.includes('/decisions/'))).toBe(true)

    const closed = await $.command.run({ command: 'skraft', args: 'close checkout 2' } as any)
    expect(closed.text).toMatch(/DESIGN closed by human validation \(reviews\/.+\/manual-close\.md\); next: DONE/)
    const state = JSON.parse(files.get(`${TRACK}/state.json`) ?? '{}')
    expect(state.findingsResolved.DESIGN).toBe(2)
    expect(files.get(`${TRACK}/reviews/${TODAY}/manual-close.md`)).toMatch(/verdict: "APPROVED"/)
  })

  test('the pane shows the phases and the outcome', { timeoutMs: 20_000 } as any, async ($, on) => {
    const clock = mock.clock(on)
    world($, on)
    await runPipeline($, clock)

    const ui = await $.ui.mount({
      plugin: 'skraft',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'skraft-pipeline',
      props: { title: 'Skraft', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { bodyRows: 20 } },
    } as any)
    expect(await ui.find({ type: 'Text', text: /checkout — done/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /✓ DESIGN/ })).toBeDefined()
    await ui.unmount()
  })
})

// G8 — write rights per agent role, judged by the mod on the engine's own word of who
// calls: the loop's agentId, $.agent.list() for its type and spawner, SessionStart's
// agent_type for the main loop under --agent. The test's tool.call hook is the engine
// running the tool: a call that reaches it was allowed.
const G8 = {
  agentAliases: {
    'skraft-orchestrator': 'Skraft - Orchestrator',
    'software-engineer': 'Skraft - Software Engineer',
    'contract-testing-worker': 'contract-testing-worker',
    'software-engineer-reviewer': 'Skraft - Software Engineer Reviewer',
    'quality-gates-lens': 'quality-gates-lens',
  },
  writeRights: {
    'Skraft - Orchestrator': { role: 'orchestrator', files: [] },
    'Skraft - Software Engineer': { role: 'specialist', phase: 'DELIVER', workspace: true },
    'contract-testing-worker': { role: 'worker', phase: 'DELIVER', workspace: true },
    'Skraft - Software Engineer Reviewer': {
      role: 'reviewer', phase: 'DELIVER',
      files: ['.copilot-tracking/skraft-plans/{projectSlug}/reviews/{date}/deliver-review-{N}.md'],
    },
    'quality-gates-lens': { role: 'lens', phase: 'DELIVER', files: [] },
  },
}
const REVIEW = `.copilot-tracking/skraft-plans/checkout/reviews/${TODAY}/deliver-review-1.md`

type Agent = { id: string; type: string; parentId?: string; spawnedBy?: string }

const writeWorld = (on: any, { agents = [] as Agent[], listFails = false } = {}) => {
  const ran: string[] = []
  on('session.cwd', () => ({ value: CWD }))
  on('env.get', () => ({ value: undefined }))
  on('fs.read', ($$: any, e: any) => (e.path.endsWith('skraft-framework.config.json') ? { value: JSON.stringify(G8) } : { deny: `ENOENT ${e.path}` }))
  on('agent.list', () => (listFails ? { deny: 'no agent list' } : { value: agents.map((a) => ({ description: '', status: 'running', ...a })) }))
  on('classic.SessionStart', () => ({}))
  on('tool.call', ($$: any, e: any) => { ran.push(`${e.agentId ?? 'main'} ${e.tool} ${e.file_path ?? e.command}`); return { result: 'ran' } })
  return { ran }
}

const write = ($: any, file_path: string, agentId?: string) =>
  $.tool.call({ tool: 'Write', file_path, content: 'x', ...(agentId ? { agentId } : {}) } as any)
const shell = ($: any, command: string, agentId?: string) =>
  $.tool.call({ tool: 'Bash', command, ...(agentId ? { agentId } : {}) } as any)

describe('skraft mod — G8 write rights', () => {
  test('the orchestrator writes neither src/ nor tests/, as a subagent or as the main loop under --agent', async ($, on) => {
    const { ran } = writeWorld(on, { agents: [{ id: 'o1', type: 'skraft:skraft-orchestrator' }] })
    expect((await write($, 'src/app.ts', 'o1')).deny).toMatch(/^skraft G8: Skraft - Orchestrator \(orchestrator\) writes nothing/)
    expect((await shell($, 'echo x > tests/app.test.ts', 'o1')).deny).toMatch(/^skraft G8:/)

    await $.classic.SessionStart({ source: 'startup', agent_type: 'skraft:skraft-orchestrator' } as any)
    expect((await write($, 'tests/app.test.ts')).deny).toMatch(/Skraft - Orchestrator/)
    expect(ran).toEqual([])
  })

  test('the Software Engineer and a DELIVER worker it spawned write src/ and tests/', async ($, on) => {
    const { ran } = writeWorld(on, {
      agents: [
        { id: 'se', type: 'skraft:software-engineer', spawnedBy: 'skraft' },
        { id: 'w1', type: 'skraft:contract-testing-worker', parentId: 'se' },
      ],
    })
    expect((await write($, 'src/app.ts', 'se')).result).toBe('ran')
    expect((await shell($, 'echo ok > tests/app.test.ts', 'se')).result).toBe('ran')
    expect((await write($, 'tests/contract.test.ts', 'w1')).result).toBe('ran')
    expect(ran).toHaveLength(3)
  })

  test('a reviewer writes its review and nothing else; a lens writes nothing', async ($, on) => {
    const { ran } = writeWorld(on, {
      agents: [
        { id: 'r1', type: 'skraft:software-engineer-reviewer', spawnedBy: 'skraft' },
        { id: 'l1', type: 'skraft:quality-gates-lens', parentId: 'r1' },
      ],
    })
    expect((await shell($, `cat <<'EOF' > ${REVIEW}\nverdict: APPROVED\nEOF`, 'r1')).result).toBe('ran')
    expect((await write($, REVIEW, 'r1')).result).toBe('ran')
    expect((await write($, 'src/app.ts', 'r1')).deny).toMatch(/Skraft - Software Engineer Reviewer \(reviewer\) writes only/)
    expect((await shell($, 'git checkout -- .', 'r1')).deny).toMatch(/this command writes elsewhere/)
    expect((await write($, REVIEW, 'l1')).deny).toMatch(/quality-gates-lens \(lens\) writes nothing/)
    expect(ran).toHaveLength(2)
  })

  test('an agent outside the rights takes those of the governed agent that spawned it', async ($, on) => {
    writeWorld(on, {
      agents: [
        { id: 'r1', type: 'skraft:software-engineer-reviewer', spawnedBy: 'skraft' },
        { id: 'g1', type: 'general-purpose', parentId: 'r1' },
        { id: 'g2', type: 'general-purpose', spawnedBy: 'skraft' },
      ],
    })
    expect((await write($, 'src/app.ts', 'g1')).deny).toMatch(/Skraft - Software Engineer Reviewer/)
    expect((await write($, 'src/app.ts', 'g2')).result).toBe('ran')
  })

  test('the main loop without --agent and an agent the engine does not list both pass', async ($, on) => {
    writeWorld(on)
    await $.classic.SessionStart({ source: 'startup' } as any)
    expect((await write($, 'src/app.ts')).result).toBe('ran')
    expect((await write($, 'src/app.ts', 'unlisted')).result).toBe('ran')
  })

  test('a guard that cannot judge refuses the write', async ($, on) => {
    const { ran } = writeWorld(on, { listFails: true })
    expect((await write($, 'src/app.ts', 'se')).deny).toMatch(/^skraft G8: the write-rights guard could not judge this call/)
    expect(ran).toEqual([])
  })
})
