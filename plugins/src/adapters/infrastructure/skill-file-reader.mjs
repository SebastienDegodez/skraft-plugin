import { readFile } from 'node:fs/promises'

// Reads a skill's SKILL.md content from the filesystem by skill name.
// Looks under pluginsRoot/skills/{skillName}/SKILL.md.
export const createSkillFileReader = ({ pluginsRoot }) => ({
  read: async (skillName) => readFile(`${pluginsRoot}/skills/${skillName}/SKILL.md`, 'utf8')
})
