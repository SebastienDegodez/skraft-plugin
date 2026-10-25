import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import { changedSubjects } from '../../eng/lib/changed-skills.mjs'
import { subjectInputsAt } from '../../eng/subject-inputs.mjs'

// What the PR planner reads from a commit, then which subjects a diff selects.
describe('subjects a pull request selects, read from a commit', () => {
  let repo

  const write = (path, content) => {
    mkdirSync(dirname(join(repo, path)), { recursive: true })
    writeFileSync(join(repo, path), content)
  }
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' })
    strictEqual(result.status, 0, result.stderr)
  }
  const catalogue = [
    { kind: 'agent', name: 'commit-convention' },
    { kind: 'agent', name: 'untagged' },
    { kind: 'agent', name: 'architect' },
  ]
  const selected = async (paths) => {
    const subjects = await Promise.all(catalogue.map(async (entry) => ({ ...entry, ...(await subjectInputsAt('HEAD', entry, { cwd: repo })) })))
    return changedSubjects(paths, subjects).agents
  }

  before(() => {
    repo = mkdtempSync(join(tmpdir(), 'subject-inputs-'))
    git('init', '-q')
    write(
      'plugins/skraft-framework/com.github.copilot/agents/software-engineer.agent.md',
      ['---', 'name: software-engineer', 'metadata:', '  skills:', '    - outside-in-tdd', '  on_demand_skills:', '    - craft-discipline', '---', 'body', ''].join('\n')
    )
    write(
      'plugins/skraft-framework/com.github.copilot/agents/solution-architect.agent.md',
      ['---', 'name: solution-architect', 'metadata:', '  skills:', '    - architecture-patterns', '---', 'body', ''].join('\n')
    )
    write('tests/agents/commit-convention/eval.yaml', ['name: commits', 'stimuli:', '  - name: one', '    tags:', '      agent: software-engineer', ''].join('\n'))
    write('tests/agents/architect/eval.yaml', ['name: design', 'stimuli:', '  - name: one', '    tags:', '      agent: solution-architect', ''].join('\n'))
    write('tests/agents/untagged/eval.yaml', ['name: untagged', 'stimuli:', '  - name: one', ''].join('\n'))
    git('add', '-A')
    git('-c', 'user.name=t', '-c', 'user.email=t@example.test', 'commit', '-q', '-m', 'catalogue')
  })

  after(() => rmSync(repo, { recursive: true, force: true }))

  it('selects the suites whose agents load a changed skill, on-demand skills included', async () => {
    deepStrictEqual(await selected(['plugins/skraft-framework/skills/craft-discipline/SKILL.md']), ['commit-convention'])
    deepStrictEqual(await selected(['plugins/skraft-framework/skills/architecture-patterns/SKILL.md']), ['architect'])
  })

  it('selects a suite whose spec names no agent on any descriptor change, and never on a skill change', async () => {
    deepStrictEqual(await selected(['plugins/skraft-framework/com.anthropic.claude-code/agents/brownfield-analyst.md']), ['untagged'])
    deepStrictEqual(await selected(['plugins/skraft-framework/skills/unrelated/SKILL.md']), [])
  })
})
