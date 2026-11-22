/** The gates of a component a DELIVER attempt holds a traced run of, in the order a developer runs them. */
export const GATE_NAMES = Object.freeze(['build', 'format', 'lint', 'test', 'architecture', 'coverage'])

/** The gates the engineer runs on its last commit, in that order: a front end's e2e after the others. */
export const DELIVERED_GATES = Object.freeze([...GATE_NAMES, 'e2e'])

/** The gates a component names a command for. @param {{ commands: Record<string, string> }} component @returns {string[]} */
export const gatesOf = (component) => GATE_NAMES.filter((gate) => gate in component.commands)

/** The gates a component names a command for that the engineer runs, e2e included. @param {{ commands: Record<string, string> }} component @returns {string[]} */
export const deliveredGatesOf = (component) => DELIVERED_GATES.filter((gate) => gate in component.commands)
