import { componentSkills } from '../../domain/pipeline/component-skills.mjs'

/**
 * @typedef {import('../../domain/pipeline/component-skills.mjs').ComponentSkill} ComponentSkill
 * @typedef {{ paths: string[], nowhere: ComponentSkill[] }} FoundSkills
 *   paths: the SKILL.md files found, each once; nowhere: the skills neither the plugin nor the
 *   working copy provides, each with the component that asks for it.
 */

/**
 * The skills the components ask for, looked up in the plugin then the working copy.
 * @param {import('../ports/agent-catalog.mjs').AgentCatalog} agentCatalog
 * @param {readonly import('../../domain/config/skraft-config.mjs').Component[]} components
 * @returns {Promise<FoundSkills>}
 */
export const findComponentSkills = async (agentCatalog, components) => {
  const asked = componentSkills(components)
  const files = await Promise.all(asked.map(({ skill }) => agentCatalog.skill(skill)))
  return {
    paths: [...new Set(files.flatMap((file) => (file === null ? [] : [file.path])))],
    nowhere: asked.filter((_, index) => files[index] === null),
  }
}
