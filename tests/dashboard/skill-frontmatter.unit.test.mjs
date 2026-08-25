import { strictEqual } from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import { discoverSkills, parseSkillContent } from '@microsoft/vally'

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'))

// A skill is addressed by the `name` its frontmatter declares — the roster
// handed to the agent, and the skill-invocation grader, both match on it. YAML
// forbids ": " inside a plain scalar, so one unquoted colon in a description
// makes the whole block unparseable. The runtime does NOT throw on that: it
// yields a skill with an empty name, which can never match anything. The skill
// is then absent from every roster while still sitting on disk, and an
// evaluation of it reports "never activated" rather than "cannot be loaded".
//
// The repository's own front-matter reader is deliberately lenient and reads
// such a description as a plain string, so the catalogue scan and the lint step
// stay green on a file the evaluation runtime cannot load. That divergence is
// why this guard asserts against the runtime's parser rather than the repo's.

function shippedSkillDirs() {
  const plugins = join(repoRoot, 'plugins')
  const dirs = []

  for (const plugin of readdirSync(plugins, { withFileTypes: true })) {
    if (!plugin.isDirectory()) continue
    const skillsRoot = join(plugins, plugin.name, 'skills')
    if (!existsSync(skillsRoot)) continue

    for (const skill of readdirSync(skillsRoot, { withFileTypes: true })) {
      if (skill.isDirectory() && existsSync(join(skillsRoot, skill.name, 'SKILL.md'))) {
        dirs.push(join(skillsRoot, skill.name))
      }
    }
  }

  return dirs
}

describe('shipped skill frontmatter', () => {
  it('lets the evaluation runtime address every skill by its own directory name', async () => {
    const dirs = shippedSkillDirs()
    strictEqual(dirs.length > 0, true, 'no shipped skills found')

    const unloadable = []
    for (const dir of dirs) {
      const where = relative(repoRoot, dir)
      const expected = basename(dir)
      const { skills, errors } = await discoverSkills(dir)

      if (errors.length > 0) {
        unloadable.push(`${where} — ${String(errors[0].reason).split('\n')[0]}`)
      } else if (skills.length !== 1) {
        unloadable.push(`${where} — resolved ${skills.length} skills, expected 1`)
      } else if (skills[0].name !== expected) {
        unloadable.push(`${where} — name parsed as ${JSON.stringify(skills[0].name)}, expected ${JSON.stringify(expected)}`)
      } else if (!skills[0].description?.trim()) {
        unloadable.push(`${where} — description parsed as empty`)
      }
    }

    strictEqual(unloadable.length, 0, `skills the runtime cannot address by name:\n${unloadable.join('\n')}`)
  })

  it('shows that an unquoted colon empties the name instead of raising', () => {
    const broken = ['---', 'name: demo-skill', 'description: Use it for TDD: start from a test.', '---', '', '# Demo', ''].join('\n')

    const parsed = parseSkillContent(broken)

    // No throw, no diagnostic — just a skill nothing can ever match.
    strictEqual(parsed.name, '')
  })

  it('keeps the name once that colon is gone', () => {
    const fixed = ['---', 'name: demo-skill', 'description: Use it for TDD — start from a test.', '---', '', '# Demo', ''].join('\n')

    strictEqual(parseSkillContent(fixed).name, 'demo-skill')
  })

  it('keeps the name when the description is quoted instead', () => {
    const quoted = ['---', 'name: demo-skill', "description: 'Use it for TDD: start from a test.'", '---', '', '# Demo', ''].join('\n')

    strictEqual(parseSkillContent(quoted).name, 'demo-skill')
  })
})
