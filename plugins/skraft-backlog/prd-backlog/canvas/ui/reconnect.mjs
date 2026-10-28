// How the panel reaches its server again once the connection drops: it waits 1.5 s, twice as
// long after each failed attempt, and gives up after the fifth; a connection that opens starts
// the waits over.

/** The waits before each new attempt, in milliseconds. */
const WAITS_MS = Object.freeze([1500, 3000, 6000, 12000, 24000])

/**
 * @param {{
 *   open: (events: { opened: () => void, failed: () => void }) => void,
 *   schedule: (attempt: () => void, ms: number) => void,
 *   giveUp: () => void,
 * }} deps open: starts one connection, which calls `opened` once it is up and `failed` once it
 *   drops or cannot open; schedule: runs `attempt` after `ms`; giveUp: no attempt is left
 * @returns {{ start: () => void }} start: connects, with the whole series of waits ahead
 */
export const createReconnect = ({ open, schedule, giveUp }) => {
  let failures = 0
  const attempt = () => open({
    opened: () => { failures = 0 },
    failed: () => {
      const wait = WAITS_MS[failures]
      failures += 1
      if (wait === undefined) giveUp()
      else schedule(attempt, wait)
    },
  })
  return {
    start: () => {
      failures = 0
      attempt()
    },
  }
}
