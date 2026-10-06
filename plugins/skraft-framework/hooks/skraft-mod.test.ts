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
  // Only git reaches a process now: the state, the evidence check and the scan run in the mod.
  on('process.run', ($$: any, e: any) => {
    const [cmd, sub] = e.argv
    const ok = (stdout = '') => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (cmd === 'git' && sub === 'rev-parse') return ok(`sha${head}\n`)
    if (cmd === 'git' && sub === 'ls-files') return ok('')
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
    expect(spawns.every((s) => s.prompt.startsWith('<!-- skraft-dispatch: run-pipeline -->'))).toBe(true)
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
