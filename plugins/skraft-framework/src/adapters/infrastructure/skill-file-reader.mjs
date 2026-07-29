import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Reads a skill's SKILL.md content from the filesystem by skill name.
// Looks under pluginsRoot/skills/{skillName}/SKILL.md.
// skillName is validated against the kebab-case pattern to prevent path traversal.
export const createSkillFileReader = ({ pluginsRoot }) => ({
  read: async (skillName) => {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(skillName)) {
      throw new Error(`Invalid skill name: ${skillName}`)
    }
    return readFile(join(pluginsRoot, 'skills', skillName, 'SKILL.md'), 'utf8')
  }
})
