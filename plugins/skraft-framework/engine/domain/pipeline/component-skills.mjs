/**
 * The skills an agent that writes component code reads for each component: the mocking skill of
 * the component's strategy and stack, and the contract testing skills only when the component
 * turns contract testing on. A stack names its family of skills; the plugin may ship none for it.
 *
 * @typedef {import('../config/skraft-config.mjs').Component} Component
 * @typedef {import('./roles.mjs').Role} Role
 */

/** The family of skills a stack reads: JavaScript and React read the TypeScript ones. @param {Component['stack']} stack */
const familyOf = (stack) => (stack === 'javascript' || stack === 'react' ? 'typescript' : stack)

/**
 * The skill names, in the order of the components; a name two components share comes twice.
 * @param {Role} role @param {readonly Component[]} components
 */
export const componentSkills = (role, components) => (role.components.length > 0 ? components.flatMap(skillsOfComponent) : [])

/** @param {Component} component */
const skillsOfComponent = ({ stack, mocking, contractTesting }) => {
  const family = familyOf(stack)
  return [`mocking-${mocking.strategy}-${family}`, ...(contractTesting ? ['contract-testing', `contract-testing-${family}`] : [])]
}
