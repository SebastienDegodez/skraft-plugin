// skraft as a Claude Code mod. Every `$` call is a one-line function handed to the
// claude-mod driver (engine/drivers/claude-mod/), which composes the engine's use cases.
//
//   /skraft <slug> [#issue] [title…] [--base <ref>] [--from-artifacts]   Init then RunPipeline in the background, pane `skraft-pipeline`
//   /skraft                            the Observe view of the active pipeline
//   /skraft decide [<key>] <answer> [reason…]   answer the question the run waits on, then resume it
//   a pane button per option of that question   the same answer, pressed by the person (journaled by: host)
//   mcp__skraft__run_pipeline          the same start, for the model
//   turn.step                          the Claude Code effort skraft assigns a subagent, set on each of its model requests
//                                      (a hook rewriting `effort` reaches the request: measured on Claude Code 2.1.291 and 2.1.314)
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { SkraftPipelineSnapshot } from '../types'
import { COMMAND, PANE_ID, PANE_TITLE, TOOL, UNEXPECTED_REQUEST, createClaudeModDriver } from '../engine/drivers/claude-mod/claude-mod-driver.mjs'
import { answerChoices, paneRows } from '../engine/drivers/claude-mod/run-view.mjs'

const pipeline = atom({ plugin: 'skraft', key: 'pipeline' } as const, null as SkraftPipelineSnapshot | null)
const driver = createClaudeModDriver()

const hostOf = ($: EngineInterface) => ({
  fs: {
    read: (path: string) => $.fs.read(path) as Promise<string>,
    write: (path: string, text: string) => $.fs.write(path, text),
    exists: (path: string) => $.fs.exists(path),
  },
  cwd: () => $.session.cwd(),
  home: async () => (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? null,
  pluginRoot: $.plugin.root,
  pluginName: $.plugin.name,
  spawn: (args: { prompt: string; subagentType: string; description: string; model?: string }) => $.agent.spawn(args),
  ask: (question: string, options: { options: readonly string[]; header: string }) => $.ui.ask(question, options),

  run: (argv: string[], init?: { cwd?: string; timeoutMs?: number }) => $.process.run(argv, init),
  sessionCostUsd: () => $.session.usage().then((usage) => usage.cost?.usd ?? null, () => null),
  later: (run: () => void) => void $.clock.after(0, run),
  every: (ms: number, run: () => void) => $.clock.every(ms, run),
  publish: (snapshot: SkraftPipelineSnapshot) => update($, pipeline, () => snapshot),
  status: (text: string | undefined) => void $.ui.status(text),
  notify: (line: string) => void $.ui.log(line),
  mcp: {
    tools: () => $.tool.list(),
    call: (server: string, tool: string, args: Record<string, unknown>) => $.mcp.call(server, tool, args),
  },
})

const openPane = ($: EngineInterface) => $.ui.open({ id: PANE_ID, title: PANE_TITLE })

const TONES = {
  title: { bold: true },
  closed: { color: 'green' },
  open: { color: 'cyan', bold: true },
  pending: { dimColor: true },
  reason: { color: 'yellow' },
  detail: {},
  log: { dimColor: true },
} as const

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register(COMMAND)
    await $.tool.register({ ...TOOL, inputSchema: { ...TOOL.inputSchema }, isDeferred: false })
    void driver.refresh(hostOf($)).catch(() => undefined)
    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    driver.turnComplete(e)
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    return yield* next(driver.turnStep(e))
  })

  on('command.run', { command: 'skraft' }, async ($, e) => {
    const text = await driver.command(hostOf($), e.args)
    await openPane($)
    return { text }
  }).catch(() => ({ text: UNEXPECTED_REQUEST }))

  on('tool.call', { tool: 'mcp__skraft__run_pipeline' }, async ($, e) => {
    const text = await driver.tool(hostOf($), e as { slug?: unknown; issue?: unknown; title?: unknown; base?: unknown; fromArtifacts?: unknown })
    void openPane($)
    return { result: text }
  }).catch(() => ({ result: UNEXPECTED_REQUEST }))

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const snapshot = await read($, pipeline)
    const choices = snapshot ? answerChoices(snapshot) : []
    const room = Math.max(3, (e.viewport?.rows ?? 24) - 10)
    const rows = snapshot
      ? paneRows(snapshot, room)
      : [{ key: 'title', text: 'skraft — no pipeline yet. Start one with /skraft <slug>.', tone: 'title' as const }]
    return (
      <Box flexDirection="column">
        {rows.map((row) => (
          <Text key={row.key} {...TONES[row.tone]}>
            {row.text}
          </Text>
        ))}
        {choices.length > 0 && (
          <Box flexDirection="row" gap={1}>
            {choices.map((choice) => (
              <Button key={choice.key} label={choice.label} onPress={() => void driver.answer(hostOf($), choice)} />
            ))}
          </Box>
        )}
      </Box>
    )
  })
}
