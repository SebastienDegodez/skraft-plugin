// End-to-end walk of the dashboard pipeline, without a model and without network:
// scan a plugin tree → publish a verdict into the history → assemble the data the
// page reads → flatten recorded sessions for replay.
import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it } from 'node:test'

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'))
const run = (script, args) => execFileSync(process.execPath, [join(repoRoot, script), ...args], { encoding: 'utf8' })
const write = (path, content) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

let workspace

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'skraft-dashboard-'))

  write(join(workspace, 'plugins/skraft-framework/.claude-plugin/plugin.json'), JSON.stringify({ name: 'demo', version: '2.0.0', description: 'Demo plugin.' }))
  write(
    join(workspace, 'plugins/skraft-framework/skills/demo-skill/SKILL.md'),
    ['---', 'name: demo-skill', 'description: Use when demonstrating the dashboard pipeline.', '---', '', '# Demo', '', '## When to use', '', '1. Always', ''].join('\n'),
  )
  write(
    join(workspace, 'plugins/skraft-framework/skills/undescribed-skill/SKILL.md'),
    ['---', 'name: undescribed-skill', '---', '', '# Undescribed', ''].join('\n'),
  )
  write(
    join(workspace, 'plugins/skraft-framework/com.github.copilot/agents/demo.agent.md'),
    ['---', 'name: Demo Agent', 'description: Runs the demo.', 'model: Claude Sonnet 5', 'user-invocable: false', '---', '', '# Demo agent', ''].join('\n'),
  )
  write(
    join(workspace, 'plugins/skraft-framework/com.github.copilot/agents/skraft-orchestrator.agent.md'),
    ['---', 'name: Skraft - Orchestrator', 'description: Runs engineering.', 'user-invocable: true', 'agents:', '  - Research Specialist', '  - Delivery Specialist', '  - Delivery Reviewer', 'metadata:', '  phases:', '    - RESEARCH', '    - DELIVER', '  skills:', '    - demo-skill', '  inputs:', '    required:', '      - refined-story', '  outputs:', '    - evidence', '---', ''].join('\n'),
  )
  write(
    join(workspace, 'plugins/skraft-framework/com.github.copilot/agents/research-specialist.agent.md'),
    ['---', 'name: Research Specialist', 'description: Researches.', 'userInvocable: false', 'metadata:', '  phase: RESEARCH', '  dispatched_by: Skraft - Orchestrator', '  skills:', '    - demo-skill', '---', ''].join('\n'),
  )
  write(
    join(workspace, 'plugins/skraft-framework/com.github.copilot/agents/delivery-specialist.agent.md'),
    ['---', 'name: Delivery Specialist', 'description: Delivers.', 'metadata:', '  phase: DELIVER', '  dispatched_by: Skraft - Orchestrator', '  skills:', '    - demo-skill', '---', ''].join('\n'),
  )
  write(
    join(workspace, 'plugins/skraft-framework/com.github.copilot/agents/delivery-reviewer.agent.md'),
    ['---', 'name: Delivery Reviewer', 'description: Reviews delivery.', 'agents:', '  - Demo Lens', 'metadata:', '  phase: DELIVER-REVIEW', '  dispatched_by: Skraft - Orchestrator', '---', ''].join('\n'),
  )
  write(
    join(workspace, 'plugins/skraft-framework/com.github.copilot/agents/backlog-discoverer.agent.md'),
    ['---', 'name: Backlog Discovery', 'description: Finds work.', 'userInvocable: true', 'metadata:', '  skills:', '    - demo-skill', '---', ''].join('\n'),
  )
  write(
    join(workspace, 'plugins/skraft-framework/com.github.copilot/agents/backlog-planner.agent.md'),
    ['---', 'name: Backlog Planning', 'description: Refines work.', 'user-invocable: true', 'metadata:', '  skills:', '    - demo-skill', '---', ''].join('\n'),
  )
  write(
    join(workspace, 'plugins/skraft-framework/com.github.copilot/agents/workers/demo-worker.agent.md'),
    ['---', 'name: Demo Worker', 'description: Supports delivery.', 'metadata:', '  dispatched_by: Delivery Specialist', '  skills:', '    - demo-skill', '---', ''].join('\n'),
  )
  write(
    join(workspace, 'plugins/skraft-framework/com.github.copilot/agents/reviewer-lenses/demo-lens.agent.md'),
    ['---', 'name: Demo Lens', 'description: Reviews the demo.', 'metadata:', '  dispatched_by: Delivery Reviewer', '---', '', '# Demo lens', ''].join('\n'),
  )
  write(
    join(workspace, 'plugins/skraft-framework/skraft-framework.config.json'),
    JSON.stringify({ phaseOrder: ['RESEARCH', 'DELIVER'] }),
  )
  write(
    join(workspace, 'tests/skills/demo-skill/eval.yaml'),
    ['name: demo-skill', 'defaults:', '  runs: 3', 'stimuli:', '  - name: first', '    prompt: hello', '  - name: second', '    prompt: world', ''].join('\n'),
  )
})

after(() => rmSync(workspace, { recursive: true, force: true }))

describe('catalogue scan', () => {
  it('reports what the plugin ships, how heavy it is, and what is evaluated', () => {
    const reportPath = join(workspace, 'report.json')
    run('eng/catalog/scan.mjs', ['--root', workspace, '--out', reportPath])
    const report = JSON.parse(readFileSync(reportPath, 'utf8'))

    strictEqual(report.plugin.name, 'demo')
    strictEqual(report.plugin.version, '2.0.0')
    strictEqual(report.summary.skills, 2)
    strictEqual(report.schemaVersion, 2)
    strictEqual(report.summary.agents, 7)
    strictEqual(report.summary.workers, 1)
    strictEqual(report.summary.lenses, 1)
    strictEqual(report.summary.evaluatedSkills, 1)

    const evaluated = report.skills.find((skill) => skill.directory === 'demo-skill')
    strictEqual(evaluated.evaluation.path, 'tests/skills/demo-skill/eval.yaml')
    strictEqual(evaluated.evaluation.trials, 6)
    strictEqual(evaluated.profile.hasWhenToUse, true)

    const lens = report.agents.find((agent) => agent.kind === 'lens')
    strictEqual(lens.name, 'Demo Lens')
    strictEqual(lens.id, 'demo-lens')
    strictEqual(lens.anchor, 'lens-demo-lens')

    deepStrictEqual(report.topology.roots, ['backlog-discoverer', 'backlog-planner', 'skraft-orchestrator'])
    deepStrictEqual(report.topology.journeys.engineering, {
      entrypoint: 'skraft-orchestrator',
      phases: [
        { phase: 'RESEARCH', specialist: 'research-specialist', reviewer: null },
        { phase: 'DELIVER', specialist: 'delivery-specialist', reviewer: 'delivery-reviewer' },
      ],
    })
    deepStrictEqual(report.topology.journeys.productToEngineering.variants, [
      ['skraft-orchestrator'],
      ['backlog-planner', 'skraft-orchestrator'],
      ['backlog-discoverer', 'backlog-planner', 'skraft-orchestrator'],
    ])
    ok(report.topology.edges.some((edge) => edge.type === 'dispatch' && edge.from === 'delivery-specialist' && edge.to === 'demo-worker'))
    ok(report.topology.edges.some((edge) => edge.type === 'dispatch' && edge.from === 'delivery-reviewer' && edge.to === 'demo-lens'))
    deepStrictEqual(report.topology.edges.filter((edge) => edge.type === 'dispatch' && edge.from === 'skraft-orchestrator').map((edge) => edge.order), [0, 1, 2])
    strictEqual(report.agents.find((agent) => agent.id === 'backlog-discoverer').userInvocable, true)
    strictEqual(report.agents.find((agent) => agent.id === 'backlog-planner').userInvocable, true)
    deepStrictEqual(report.agents.find((agent) => agent.id === 'skraft-orchestrator').artifacts, { inputs: ['refined-story'], outputs: ['evidence'] })
  })

  it('warns about a skill with no description instead of failing silently', () => {
    const reportPath = join(workspace, 'report.json')
    const report = JSON.parse(readFileSync(reportPath, 'utf8'))

    ok(report.findings.some((finding) => finding.code === 'SKILL_DESCRIPTION_MISSING'))
  })
})

describe('history publication', () => {
  it('turns a verdict into a dated, attributed history entry', () => {
    const resultsPath = join(workspace, 'eval-results/demo-skill/results.json')
    write(
      resultsPath,
      JSON.stringify({
        model: 'claude-sonnet-5',
        judgeModel: 'gpt-5.6-luna',
        timestamp: '2026-08-03T10:00:00.000Z',
        verdicts: [
          {
            subject: { kind: 'skill', name: 'demo-skill', path: 'plugins/skraft-framework/skills/demo-skill' },
            conclusive: true,
            underpowered: false,
            passed: true,
            regressed: false,
            netWin: 0.75,
            trialCount: 8,
            meanScore: 4.25,
            confidenceInterval: { low: 3.9, high: 4.6, level: 0.95 },
            reason: 'credibly better (7W/0T/1L, sign test p=0.008)',
            signTest: { wins: 7, ties: 0, losses: 1, pValue: 0.008 },
            metrics: {
              quality: { baseline: 0.58, skilled: 0.92, delta: 0.34 },
              activation: { expected: 6, actual: 6, unexpected: 0, rate: 1 },
              efficiency: {
                baseline: { durationMs: 21000, tokens: 40000, turns: 3, toolCalls: 3 },
                skilled: { durationMs: 30000, tokens: 96000, turns: 6, toolCalls: 8 },
                durationDeltaPercent: 42.9,
                tokenDeltaPercent: 140,
              },
            },
          },
        ],
      }),
    )

    const historyPath = join(workspace, 'history.json')
    run('eng/dashboard/update-history.mjs', ['--results', resultsPath, '--history', historyPath, '--commit', 'abc1234', '--run', '99'])
    const history = JSON.parse(readFileSync(historyPath, 'utf8'))

    strictEqual(history.skills['demo-skill'].length, 1)
    strictEqual(history.skills['demo-skill'][0].state, 'pass')
    strictEqual(history.skills['demo-skill'][0].commit, 'abc1234')
    strictEqual(history.skills['demo-skill'][0].model, 'claude-sonnet-5')
  })

  it('carries the judged score and its interval so the dashboard can show a trend', () => {
    const history = JSON.parse(readFileSync(join(workspace, 'history.json'), 'utf8'))

    strictEqual(history.skills['demo-skill'][0].meanScore, 4.25)
    deepStrictEqual(history.skills['demo-skill'][0].confidenceInterval, { low: 3.9, high: 4.6 })
    deepStrictEqual(history.skills['demo-skill'][0].metrics.quality, { baseline: 0.58, skilled: 0.92, delta: 0.34 })
  })

  it('does not duplicate the same run when it is republished', () => {
    const historyPath = join(workspace, 'history.json')
    run('eng/dashboard/update-history.mjs', ['--results', join(workspace, 'eval-results/demo-skill/results.json'), '--history', historyPath, '--run', '99'])
    const history = JSON.parse(readFileSync(historyPath, 'utf8'))

    strictEqual(history.skills['demo-skill'].length, 1)
  })
})

describe('dashboard data', () => {
  it('joins the catalogue with the evidence and points at the data branch', () => {
    const outputPath = join(workspace, 'dashboard.json')
    run('eng/dashboard/build.mjs', [
      '--report',
      join(workspace, 'report.json'),
      '--history',
      join(workspace, 'history.json'),
      '--out',
      outputPath,
      '--repository',
      'acme/demo',
      '--data-branch',
      'evidence',
    ])
    const dashboard = JSON.parse(readFileSync(outputPath, 'utf8'))

    strictEqual(dashboard.schemaVersion, 2)
    strictEqual(dashboard.summary.skills, 2)
    deepStrictEqual(dashboard.topology.journeys.engineering.phases, [
      { phase: 'RESEARCH', specialist: 'research-specialist', reviewer: null },
      { phase: 'DELIVER', specialist: 'delivery-specialist', reviewer: 'delivery-reviewer' },
    ])
    strictEqual(dashboard.history['demo-skill'][0].state, 'pass')
    strictEqual(dashboard.sources.history, 'https://raw.githubusercontent.com/acme/demo/evidence/data/history.json')
    strictEqual(dashboard.sources.replayManifest, 'https://raw.githubusercontent.com/acme/demo/evidence/data/manifest.json')
  })
})

describe('replay sessions', () => {
  it('names every recorded trial by skill, scenario and variant', () => {
    const sessionRoot = join(workspace, 'vally-run/executor-session-logs/demo-skill/claude/first')
    for (const variant of ['baseline', 'skilled']) {
      write(
        join(sessionRoot, variant, 'metadata.json'),
        JSON.stringify({ evalFilePath: 'tests/skills/demo-skill/eval.yaml', variant, stimulusName: 'Drive the demo', trialIndex: 0 }),
      )
      write(join(sessionRoot, variant, 'events.jsonl'), '{"type":"start"}\n')
    }

    const replayRoot = join(workspace, 'replay')
    run('eng/dashboard/build-replay-sessions.mjs', [
      '--results-dir',
      join(workspace, 'vally-run'),
      '--output-dir',
      replayRoot,
      '--source',
      'pr',
      '--pr-number',
      '134',
    ])
    const manifest = JSON.parse(readFileSync(join(replayRoot, 'manifest.json'), 'utf8'))

    strictEqual(manifest.sessions.length, 2)
    ok(manifest.sessions.every((session) => session.url.startsWith('sessions/pr/134/demo-skill/')))
    ok(manifest.sessions.some((session) => session.tags.includes('baseline')))
    ok(manifest.sessions.some((session) => session.tags.includes('skilled')))
    ok(manifest.sessions.every((session) => session.tags.includes('pr-134')))
  })

  it('separates baseline from skilled when Vally records both as main', () => {
    // Vally 0.12 writes each trajectory directly under its trial directory and
    // stamps both isolated evals as `main`; the output directory still records
    // which arm each trial belongs to.
    const runRoot = join(workspace, 'paired-run/demo-skill')
    for (const variant of ['baseline', 'skilled']) {
      const sessionRoot = join(runRoot, variant, '2026-08-05T10-00-00-000Z/demo-skill/drive-the-demo/claude-sonnet-5/0')
      write(
        join(sessionRoot, 'metadata.json'),
        JSON.stringify({ evalFilePath: 'tests/skills/demo-skill/eval.yaml', variant: 'main', stimulusName: 'Drive the demo', trialIndex: 0 }),
      )
      write(join(sessionRoot, 'events.jsonl'), '{"type":"start"}\n')
    }

    const replayRoot = join(workspace, 'paired-replay')
    run('eng/dashboard/build-replay-sessions.mjs', [
      '--results-dir',
      join(workspace, 'paired-run'),
      '--output-dir',
      replayRoot,
      '--date',
      '2026-08-05',
    ])
    const manifest = JSON.parse(readFileSync(join(replayRoot, 'manifest.json'), 'utf8'))

    strictEqual(manifest.sessions.length, 2)
    ok(manifest.sessions.some((session) => session.tags.includes('baseline')))
    ok(manifest.sessions.some((session) => session.tags.includes('skilled')))
    ok(!manifest.sessions.some((session) => session.tags.includes('unknown')))
  })

  it('keeps prior scheduled dates when a later run is added', () => {
    const runRoot = join(workspace, 'scheduled-run/demo-skill')
    for (const variant of ['baseline', 'skilled']) {
      const sessionRoot = join(runRoot, variant, '2026-08-05T10-00-00-000Z/demo-skill/drive-the-demo/claude-sonnet-5/0')
      write(
        join(sessionRoot, 'metadata.json'),
        JSON.stringify({ evalFilePath: 'tests/skills/demo-skill/eval.yaml', variant: 'main', stimulusName: 'Drive the demo', trialIndex: 0 }),
      )
      write(join(sessionRoot, 'events.jsonl'), '{"type":"start"}\n')
    }

    const replayRoot = join(workspace, 'scheduled-replay')
    for (const date of ['2026-08-05', '2026-08-12']) {
      run('eng/dashboard/build-replay-sessions.mjs', [
        '--results-dir',
        join(workspace, 'scheduled-run'),
        '--output-dir',
        replayRoot,
        '--date',
        date,
      ])
    }

    const manifest = JSON.parse(readFileSync(join(replayRoot, 'manifest.json'), 'utf8'))
    strictEqual(manifest.sessions.length, 4)
    ok(manifest.sessions.some((session) => session.url.startsWith('sessions/scheduled/2026-08-05/')))
    ok(manifest.sessions.some((session) => session.url.startsWith('sessions/scheduled/2026-08-12/')))
  })

  it('drops sessions older than the retention window and never leaves a dangling entry', () => {
    const replayRoot = join(workspace, 'replay')
    write(join(replayRoot, 'sessions/scheduled/2026-01-01/demo-skill/old--skilled--run0.jsonl'), '{}\n')
    const manifestPath = join(replayRoot, 'manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    manifest.sessions.push({
      id: 'scheduled/2026-01-01/demo-skill/old--skilled--run0',
      url: 'sessions/scheduled/2026-01-01/demo-skill/old--skilled--run0.jsonl',
      name: 'old',
      tags: ['scheduled'],
      mtime: 0,
    })
    writeFileSync(manifestPath, JSON.stringify(manifest))

    run('eng/dashboard/purge-replay-sessions.mjs', ['--root', replayRoot, '--retention-days', '0'])
    const purged = JSON.parse(readFileSync(manifestPath, 'utf8'))

    strictEqual(purged.sessions.length, 2)
    ok(purged.sessions.every((session) => !session.url.includes('2026-01-01')))
  })
})
