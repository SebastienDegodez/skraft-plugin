import { deepStrictEqual, match, notStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseCompanions, parseTree, stagedSources, subjectFingerprint } from '../../eng/lib/eval-reuse.mjs'

// `git ls-tree -r` lines: one tracked file per line, its blob standing for its content.
const lsTree = (files) =>
  Object.entries(files)
    .map(([path, blob]) => `100644 blob ${blob}\t${path}`)
    .join('\n')

const REPO = {
  'plugins/skraft-framework/skills/outside-in-tdd/SKILL.md': 'a1',
  'plugins/skraft-framework/skills/outside-in-tdd/references/red.md': 'a2',
  'plugins/skraft-framework/skills/bdd-methodology/SKILL.md': 'b1',
  'plugins/skraft-framework/skills/mutation-testing/SKILL.md': 'm1',
  'plugins/skraft-backlog/skills/backlog-refinement/SKILL.md': 'r1',
  'plugins/skraft-framework/com.github.copilot/agents/software-engineer.agent.md': 'e1',
  'plugins/skraft-framework/com.anthropic.claude-code/agents/software-engineer.md': 'c1',
  'plugins/skraft-framework/engine/application/config/configure.mjs': 'x1',
  '.github/agents/skraft-docs-orchestrator.agent.md': 'd1',
  'tests/skills/outside-in-tdd/eval.yaml': 's1',
  'tests/skills/outside-in-tdd/eval.skill-dir.yaml': 's2',
  'tests/skills/outside-in-tdd/fixtures/orders/pom.xml': 's3',
  'tests/skills/bdd-methodology/eval.yaml': 's4',
  'tests/agents/commit-convention/eval.yaml': 't1',
  'tests/agents/commit-convention/fixtures/red/README.md': 't2',
  'tests/agents/mutation-gates/eval.yaml': 't3',
  'eng/run-vally-evals.sh': 'v1',
  'eng/vally-adapter/adapt.mjs': 'v2',
  'eng/vally-agent-executor/executor.mjs': 'v3',
  'eng/lib/verdict.mjs': 'v4',
  'eng/plan-eval-matrix.mjs': 'v5',
  'eng/eval-reuse.mjs': 'v6',
  'package.json': 'p1',
  'package-lock.json': 'p2',
  'plugins/skraft-framework/assets/consistency-matrix.template.md': 'k1',
  'scripts/tool.mjs': 'g1',
  'scripts/other.mjs': 'g2',
  'scripts/shared/lib.mjs': 'g3',
  'eng/dashboard/build.mjs': 'z1',
  'docs/skill-evaluation.md': 'z2',
}

const ENV = {
  VALLY_PACKAGE: '@microsoft/vally-cli@0.12.0',
  COPILOT_SDK_PACKAGE: '@github/copilot-sdk@1.0.9',
  COPILOT_CLI_PACKAGE: '@github/copilot@1.0.78',
  JUDGE_MODEL: 'gpt-5.6-luna',
  MODEL: '',
}

const SKILL = { kind: 'skill', name: 'outside-in-tdd', args: 'skills outside-in-tdd' }
const AGENT = { kind: 'agent', name: 'commit-convention', args: 'agents commit-convention' }

const fingerprint = (subject, { files = {}, env = {}, companions = ['bdd-methodology'], staged = [], agents = ['software-engineer'] } = {}) =>
  subjectFingerprint(subject, {
    tree: parseTree(lsTree({ ...REPO, ...files })),
    companions,
    staged,
    agents,
    env: { ...ENV, ...env },
  })

// Tooling and code a pull request may change without moving any verdict worth
// measuring again: a change there is checked by its own tests.
const TOOLING_CHANGES = [
  ['the runner', { 'eng/run-vally-evals.sh': 'v9' }],
  ['the verdict adapter', { 'eng/vally-adapter/adapt.mjs': 'v9' }],
  ['the agent executor', { 'eng/vally-agent-executor/executor.mjs': 'v9' }],
  ['a library the adapter imports', { 'eng/lib/verdict.mjs': 'v9' }],
  ['the matrix planner', { 'eng/plan-eval-matrix.mjs': 'v9' }],
  ['the reuse planner', { 'eng/eval-reuse.mjs': 'v9' }],
  ['the project manifest', { 'package.json': 'p9' }],
  ['the project lockfile', { 'package-lock.json': 'p9' }],
  ['engine code', { 'plugins/skraft-framework/engine/application/config/configure.mjs': 'x2' }],
]

describe('subjectFingerprint — a skill', () => {
  it('is stable for unchanged inputs, whatever else the commit changed', () => {
    const before = fingerprint(SKILL)
    match(before, /^sha256:[0-9a-f]{64}$/)
    strictEqual(
      fingerprint(SKILL, {
        files: {
          'plugins/skraft-framework/engine/application/config/configure.mjs': 'x2',
          'eng/dashboard/build.mjs': 'z9',
          'docs/skill-evaluation.md': 'z8',
          'tests/skills/bdd-methodology/eval.yaml': 's9',
          'plugins/skraft-framework/skills/mutation-testing/SKILL.md': 'm2',
          'plugins/skraft-framework/com.github.copilot/agents/software-engineer.agent.md': 'e2',
        },
      }),
      before
    )
  })

  for (const [what, files] of [
    ['its own skill file', { 'plugins/skraft-framework/skills/outside-in-tdd/references/red.md': 'a9' }],
    ['a file added to its skill', { 'plugins/skraft-framework/skills/outside-in-tdd/scripts/run.sh': 'a3' }],
    ['its eval spec', { 'tests/skills/outside-in-tdd/eval.yaml': 's9' }],
    ['one of its fixtures', { 'tests/skills/outside-in-tdd/fixtures/orders/pom.xml': 's9' }],
    ['a companion skill it mounts', { 'plugins/skraft-framework/skills/bdd-methodology/SKILL.md': 'b9' }],
  ]) {
    it(`moves when ${what} changes`, () => {
      notStrictEqual(fingerprint(SKILL, { files }), fingerprint(SKILL))
    })
  }

  for (const [what, files] of TOOLING_CHANGES) {
    it(`stays when ${what} changes`, () => {
      strictEqual(fingerprint(SKILL, { files }), fingerprint(SKILL))
    })
  }

  it('stays when a pinned toolchain or model changes', () => {
    const before = fingerprint(SKILL)
    for (const env of [
      { VALLY_PACKAGE: '@microsoft/vally-cli@0.13.0' },
      { COPILOT_CLI_PACKAGE: '@github/copilot@1.0.79' },
      { JUDGE_MODEL: 'gpt-5.6-terra' },
      { MODEL: 'forced-model' },
    ]) {
      strictEqual(fingerprint(SKILL, { env }), before, JSON.stringify(env))
    }
  })

  it('moves when the set of companion skills changes', () => {
    notStrictEqual(fingerprint(SKILL, { companions: ['bdd-methodology', 'mutation-testing'] }), fingerprint(SKILL))
    // A companion the runner cannot find mounts nothing, but naming it is still a change.
    notStrictEqual(fingerprint(SKILL, { companions: ['bdd-methodology', 'not-shipped'] }), fingerprint(SKILL))
  })

  it('moves when the runner arguments of the cell change', () => {
    notStrictEqual(fingerprint({ ...SKILL, args: 'skills outside-in-tdd --other' }), fingerprint(SKILL))
  })

  it('never matches another subject that reads the same files', () => {
    notStrictEqual(fingerprint({ kind: 'skill', name: 'bdd-methodology' }, { companions: [] }), fingerprint(SKILL))
  })
})

describe('subjectFingerprint — an agent suite', () => {
  it('is stable when only engine code, tooling, skills, another agent and another suite changed', () => {
    strictEqual(
      fingerprint(AGENT, {
        companions: [],
        files: {
          'plugins/skraft-framework/engine/application/config/configure.mjs': 'x2',
          'tests/agents/mutation-gates/eval.yaml': 't9',
          'tests/skills/outside-in-tdd/eval.yaml': 's9',
          'eng/vally-agent-executor/executor.mjs': 'v9',
          'plugins/skraft-framework/skills/mutation-testing/SKILL.md': 'm2',
          'plugins/skraft-framework/assets/consistency-matrix.template.md': 'k2',
          '.github/agents/skraft-docs-orchestrator.agent.md': 'd2',
        },
      }),
      fingerprint(AGENT, { companions: [] })
    )
  })

  for (const [what, files] of [
    ['its own suite', { 'tests/agents/commit-convention/fixtures/red/README.md': 't9' }],
    ['the Copilot descriptor of the agent it exercises', { 'plugins/skraft-framework/com.github.copilot/agents/software-engineer.agent.md': 'e2' }],
    ['the Claude Code descriptor of the agent it exercises', { 'plugins/skraft-framework/com.anthropic.claude-code/agents/software-engineer.md': 'c2' }],
  ]) {
    it(`moves when ${what} changes`, () => {
      notStrictEqual(fingerprint(AGENT, { files, companions: [] }), fingerprint(AGENT, { companions: [] }))
    })
  }

  it('moves when a skill the agent it exercises loads changes, and only that skill', () => {
    const loads = (files) =>
      subjectFingerprint(AGENT, { tree: parseTree(lsTree({ ...REPO, ...files })), agents: ['software-engineer'], skills: ['mutation-testing'] })
    notStrictEqual(loads({ 'plugins/skraft-framework/skills/mutation-testing/SKILL.md': 'm2' }), loads({}))
    strictEqual(loads({ 'plugins/skraft-framework/skills/bdd-methodology/SKILL.md': 'b2' }), loads({}))
  })

  it('moves when a repository agent it exercises changes', () => {
    const agents = ['skraft-docs-orchestrator']
    notStrictEqual(
      fingerprint(AGENT, { companions: [], agents, files: { '.github/agents/skraft-docs-orchestrator.agent.md': 'd2' } }),
      fingerprint(AGENT, { companions: [], agents })
    )
  })
})

describe('parseTree', () => {
  it('reads mode, blob and path from git ls-tree output, ignoring blank lines', () => {
    deepStrictEqual(parseTree('100755 blob abc\teng/run-vally-evals.sh\n\n100644 blob def\ttests/a b/eval.yaml\n'), [
      { mode: '100755', blob: 'abc', path: 'eng/run-vally-evals.sh' },
      { mode: '100644', blob: 'def', path: 'tests/a b/eval.yaml' },
    ])
  })
})

describe('parseCompanions', () => {
  it('reads the skill list the runner mounts, skipping comments and stopping at the next key', () => {
    const sidecar = [
      '# Companion skills mounted beside the target',
      'skills:',
      '  - bdd-methodology',
      '  # - parked-skill',
      '  - clean-architecture-testing  ',
      'notes:',
      '  - not-a-skill',
    ].join('\n')
    deepStrictEqual(parseCompanions(sidecar), ['bdd-methodology', 'clean-architecture-testing'])
  })

  it('returns no companion when there is no sidecar', () => {
    deepStrictEqual(parseCompanions(''), [])
  })
})

describe('a file a spec stages from outside its own folder', () => {
  const STAGED = ['scripts/tool.mjs', 'scripts/shared']

  it('moves the fingerprint when it changes, and only that file or tree', () => {
    const before = fingerprint(AGENT, { companions: [], staged: STAGED })
    notStrictEqual(fingerprint(AGENT, { companions: [], staged: STAGED, files: { 'scripts/tool.mjs': 'g9' } }), before)
    notStrictEqual(fingerprint(AGENT, { companions: [], staged: STAGED, files: { 'scripts/shared/lib.mjs': 'g9' } }), before)
    strictEqual(fingerprint(AGENT, { companions: [], staged: STAGED, files: { 'scripts/other.mjs': 'g9' } }), before)
    strictEqual(fingerprint(AGENT, { companions: [], staged: STAGED, files: { 'scripts/shared-not.mjs': 'g9' } }), before)
  })

  it('counts for a skill as well', () => {
    notStrictEqual(
      fingerprint(SKILL, { staged: ['scripts/tool.mjs'], files: { 'scripts/tool.mjs': 'g9' } }),
      fingerprint(SKILL, { staged: ['scripts/tool.mjs'] })
    )
  })
})

describe('stagedSources', () => {
  it('resolves every staged source from the spec folder, wherever it sits in the spec', () => {
    const spec = {
      name: 'suite',
      defaults: { environment: { files: [{ src: '../../shared/', dest: 'shared' }] } },
      stimuli: [
        { name: 'one', environment: { files: [{ src: 'fixtures/a/README.md', dest: 'README.md' }, { src: '../../../scripts/tool.mjs', dest: 'tool.mjs' }] } },
        { name: 'two', environment: { files: [{ src: '../../../scripts/tool.mjs', dest: 'tool.mjs' }] } },
      ],
    }
    deepStrictEqual(stagedSources(spec, 'tests/agents/suite'), ['scripts/tool.mjs', 'tests/agents/suite/fixtures/a/README.md', 'tests/shared'])
  })

  it('leaves out a source outside the repository, which no commit can change', () => {
    deepStrictEqual(stagedSources({ files: [{ src: '../../../../elsewhere.txt' }, { src: 7 }] }, 'tests/agents/suite'), [])
  })

  it('returns nothing for a spec that stages nothing', () => {
    deepStrictEqual(stagedSources(null, 'tests/agents/suite'), [])
  })
})
