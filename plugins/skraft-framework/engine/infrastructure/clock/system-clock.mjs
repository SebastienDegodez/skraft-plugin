/** @returns {import('../../application/ports/clock.mjs').Clock} */
export const createSystemClock = () => Object.freeze({ now: () => new Date() })
