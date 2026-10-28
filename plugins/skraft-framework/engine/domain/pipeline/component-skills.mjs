/**
 * The skills an agent that writes tests against component code (TDD cycles, killing surviving
 * mutants) reads for each component: the
 * mocking skill of the component's strategy and stack, and the contract testing skills only when
 * the component turns contract testing on. A stack names its family of skills; the plugin may
 * ship none for it.
 *
 * @typedef {import('../config/skraft-config.mjs').Component} Component
 * @typedef {import('./roles.mjs').Role} Role
 * @typedef {{ component: string, skill: string }} ComponentSkill
 */

/** The family of skills a stack reads: React reads the TypeScript ones. @param {Component['stack']} stack */
const familyOf = (stack) => (stack === 'react' ? 'typescript' : stack)

/** The agents that write tests against component code: a TDD cycle, and killing surviving mutants. */
const WRITES_TESTS = Object.freeze(['cycle', 'kill'])

/** Whether the agent of that role writes tests against component code. @param {Role} role */
export const writesComponentTests = (role) => WRITES_TESTS.includes(String(role.tdd))

/**
 * The skill names, in the order of the components, each with the component that asks for it; a
 * name two components share comes twice.
 * @param {readonly Component[]} components @returns {ComponentSkill[]}
 */
export const componentSkills = (components) => components.flatMap((component) => skillsOfComponent(component).map((skill) => ({ component: component.name, skill })))

/** @param {Component} component */
const skillsOfComponent = ({ stack, mocking, contractTesting }) => {
  const family = familyOf(stack)
  const contract = ['contract-testing', `contract-testing-${family}`]
  return [`mocking-${mocking.strategy}-${family}`, ...contract.filter(() => contractTesting)]
}
