/**
 * Timer on Node's setInterval; the interval keeps no process alive.
 * @returns {import('../../application/ports/timer.mjs').Timer}
 */
export const createNodeTimer = () => Object.freeze({
  every: (ms, run) => {
    const interval = setInterval(() => void run(), ms)
    interval.unref()
    return () => clearInterval(interval)
  },
})
