/** The gates of a component a DELIVER attempt holds a traced run of, in the order a developer runs them. */
export const GATE_NAMES = Object.freeze(['build', 'format', 'lint', 'test', 'architecture', 'coverage'])

/** The gates a component names a command for. @param {{ commands: Record<string, string> }} component @returns {string[]} */
export const gatesOf = (component) => GATE_NAMES.filter((gate) => gate in component.commands)
