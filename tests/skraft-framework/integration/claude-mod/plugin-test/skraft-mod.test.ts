// `claude plugin test`, run by ../run-plugin-test.mjs on a copy of the plugin: the real
// hooks module inside the engine's own runtime. The test's hooks stand for the engine
// beneath the mod: a file system in a Map and the Agent tool. The kit drops the agentId a
// hook answers `agent.spawn` with (core alone sets it), so here every spawn reaches the
// researcher and then counts as not started; the Node tests beside this folder drive the
// answered path (turn.complete) with scripted `$` functions.
import { describe, expect, mock, test } from 'claude-code/testing'
import { PLUGIN_FILES } from './plugin-files'

const CWD = '/work'
const PANE = 'skraft-pipeline'
const NOT_STARTED = 'skraft checkout: blocked (agent-unavailable) — skraft:solution-researcher was not started'
const TEMPLATE = '<!-- markdownlint-disable-file -->\n# Research: {{topic}}\n'
const PHASES = '▶ RESEARCH\n· DESIGN\n· DISTILL\n· DELIVER'

/** A file the plugin ships (the workflow, its agents), served by its path under the plugin root. */
const shipped = (path: string) => Object.entries(PLUGIN_FILES).find(([relative]) => path.endsWith(`/${relative}`))?.[1]

type Spawn = { prompt: string; subagentType?: string; description?: string }

const outputsOf = (prompt: string) => {
  const lines = prompt.split('\n')
  const from = lines.findIndex((line) => line.startsWith('- Fill each output')) + 1
  const paths: string[] = []
  for (const line of lines.slice(from)) {
    if (!line.startsWith('- /')) break
    paths.push(line.slice(2))
  }
  return paths
}

const world = ($: any, on: any) => {
  const files = new Map<string, string>()
  const spawns: Spawn[] = []
  const seen: Array<string | null> = []
  const logs: string[] = []

  on('session.start', ($$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', ($$: any, e: any) => ({ value: { command: e.name } }))
  on('tool.register', ($$: any, e: any) => ({ value: { tool: `mcp__skraft__${e.name}` } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: CWD }))
  on('env.get', () => ({ value: undefined }))
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [] } }))
  on('fs.exists', ($$: any, e: any) => ({ value: files.has(e.path) || shipped(e.path) !== undefined }))
  on('fs.read', ($$: any, e: any) => {
    if (e.path.endsWith('/assets/templates/research.template.md')) return { value: TEMPLATE }
    if (shipped(e.path) !== undefined) return { value: shipped(e.path) }
    if (!files.has(e.path)) return { deny: `ENOENT: ${e.path}` }
    return { value: files.get(e.path) }
  })
  on('fs.write', ($$: any, e: any) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('ui.log', ($$: any, e: any) => {
    logs.push(typeof e === 'string' ? e : e.text)
    return { value: undefined }
  })
  on('agent.spawn', ($$: any, e: any) => {
    spawns.push({ prompt: e.prompt, subagentType: e.subagentType ?? e.subagent_type, description: e.description })
    seen.push(...outputsOf(e.prompt).map((path) => files.get(path) ?? null))
    return { model: 'test', agentId: `agent-${spawns.length}` }
  })
  on('turn.complete', () => ({ text: '' }))
  return { files, spawns, seen, logs }
}

const settle = async (clock: any) => {
  for (let i = 0; i < 200; i += 1) await clock.settle()
}

describe('skraft mod', () => {
  test('/skraft <slug> starts a run in the background that spawns the researcher on its pre-created document', { timeoutMs: 20_000 } as any, async ($, on) => {
    const clock = mock.clock(on)
    const { files, spawns, seen, logs } = world($, on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: CWD } as any)

    const started = await $.command.run({ command: 'skraft', args: 'checkout #42 Pay by card' } as any)
    expect(started.text).toBe('skraft checkout started — progress in the Skraft pane.')
    expect(spawns).toEqual([])
    await settle(clock)

    expect(spawns.map((spawn) => spawn.subagentType)).toEqual(['skraft:solution-researcher'])
    expect(spawns[0].description).toBe('skraft checkout · research · attempt 1')
    expect(spawns[0].prompt).toMatch(/- Story: #42 — Pay by card/)
    const [output] = outputsOf(spawns[0].prompt)
    expect(output).toMatch(/^\/work\/\.copilot-tracking\/skraft-plans\/checkout\/research\/\d{4}-\d{2}-\d{2}\/checkout-research\.md$/)
    expect(seen).toEqual([TEMPLATE])
    expect(files.get(`${CWD}/.copilot-tracking/skraft-plans/.active-slug`)).toBe('checkout\n')
    expect(logs).toEqual([NOT_STARTED])

    const status = await $.command.run({ command: 'skraft', args: '' } as any)
    expect(status.text).toBe(`skraft checkout — blocked\n${PHASES}\nskraft:solution-researcher was not started\nagent: solution-researcher (research, attempt 1)`)
    const decided = await $.command.run({ command: 'skraft', args: 'decide yes' } as any)
    expect(decided.text).toBe('skraft: not recorded — no question to answer; no question is waiting')
  })

  test('the pane draws the run on the terminal and the desktop', { timeoutMs: 20_000 } as any, async ($, on) => {
    const clock = mock.clock(on)
    world($, on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: CWD } as any)
    await $.command.run({ command: 'skraft', args: 'checkout' } as any)
    await settle(clock)

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: 'skraft',
        surface,
        component: 'Pane',
        requestId: PANE,
        props: { title: 'Skraft', isFocused: false, bodyColumns: 80, placement: 'dock' },
      } as any)
      expect(await ui.find({ type: 'Text', text: 'skraft checkout — blocked' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '▶ RESEARCH' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'agent: solution-researcher (research, attempt 1)' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: NOT_STARTED })).toBeDefined()
      await ui.unmount()
    }
  })

  test('the run_pipeline tool with no slug and no active pipeline is refused', { timeoutMs: 20_000 } as any, async ($, on) => {
    mock.clock(on)
    const { spawns } = world($, on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: CWD } as any)

    const called = await $.tool.call({ tool: 'mcp__skraft__run_pipeline' } as any)
    expect((called as any).result).toMatch(/^skraft: refused \(no-active-pipeline\) — no active pipeline in this working copy/)
    expect(spawns).toEqual([])
  })
})
