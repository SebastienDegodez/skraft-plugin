import { deepStrictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'

import { changedSkills } from '../../eng/lib/changed-skills.mjs'

describe('changedSkills', () => {
  it('maps a skill source path to its skill name', () => {
    deepStrictEqual(changedSkills(['plugins/skraft-framework/skills/outside-in-tdd/SKILL.md']), ['outside-in-tdd'])
  })

  it('maps an eval spec path to its skill name', () => {
    deepStrictEqual(changedSkills(['tests/skills/outside-in-tdd/eval.yaml']), ['outside-in-tdd'])
  })

  it('de-duplicates and sorts multiple changed skills', () => {
    const paths = [
      'plugins/skraft-framework/skills/zeta/SKILL.md',
      'tests/skills/alpha/eval.yaml',
      'plugins/skraft-framework/skills/alpha/reference.md',
    ]
    deepStrictEqual(changedSkills(paths), ['alpha', 'zeta'])
  })

  it('ignores paths outside a skill tree', () => {
    deepStrictEqual(changedSkills(['docs/skill-evaluation.md', 'eng/run-vally-evals.sh']), [])
  })

  it('ignores an empty change set', () => {
    deepStrictEqual(changedSkills([]), [])
  })
})
