/**
 * The mutation score every scope must reach, in percent. The design-skraft-quality-bar skill states it,
 * and the session recipe of skraft-mutation judges a run by it; the engine runs no mutation and
 * no configuration lowers it.
 */
export const MUTATION_BAR = 80

/** The score each scope must reach, in percent, core (Domain and Application) first. */
export const MUTATION_BARS = Object.freeze({ core: MUTATION_BAR, boundary: MUTATION_BAR })
