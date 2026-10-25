/**
 * DecisionConfirmation under Copilot, where `skraft_decide` is a session tool a model can call:
 * a decision is recorded only once the person confirms it in the host's dialog
 * (`session.ui.confirm`, which reaches the host from a tool: probe check `confirm-from-tool`,
 * Copilot CLI 1.0.101) and it answers a literal `true`. Refused, with a fixed reason that sends
 * the person to `skraft decide` in a terminal, when the host declares no elicitation, in
 * `autopilot` (the host may still relay the dialog there: `confirm-in-autopilot`), when the mode
 * cannot be read in time, and past the rate limit of this process.
 *
 * @typedef {import('../../application/ports/decision-confirmation.mjs').DecisionConfirmation} DecisionConfirmation
 * @typedef {import('../../application/ports/decision-confirmation.mjs').DecisionRequest} DecisionRequest
 * @typedef {import('../../application/ports/decision-confirmation.mjs').Confirmed} Confirmed
 * @typedef {{
 *   capabilities?: { ui?: { elicitation?: boolean } },
 *   rpc?: { mode?: { get?: () => Promise<unknown> } },
 *   ui?: { confirm?: (message: string) => Promise<unknown> },
 * }} ConfirmingSession
 * @typedef {{ modeMs: number, confirmMs: number }} Waits
 */

/** How long the host has to say its mode, and the person to answer. */
const WAITS = Object.freeze({ modeMs: 5000, confirmMs: 120_000 })
/** At most one request per 10 s, and five per 10 min, in this process. */
const RATE = Object.freeze({ gapMs: 10_000, windowMs: 600_000, perWindow: 5 })
const TIMED_OUT = Symbol('timed out')

// Stryker disable StringLiteral: text shown to the model and the person; the code is what callers read
const TERMINAL = 'answer it with skraft decide <key> <answer> typed in a terminal'
const REFUSALS = Object.freeze({
  'no-elicitation': `this Copilot host cannot ask you to confirm a decision; ${TERMINAL}`,
  autopilot: `a decision is not recorded in autopilot; ${TERMINAL}`,
  'mode-unknown': `Copilot did not say whether a person is there; ${TERMINAL}`,
  'rate-limited': `too many decisions asked in a short time; wait, or ${TERMINAL}`,
  'not-confirmed': 'you did not confirm the decision in Copilot',
})
// Stryker restore StringLiteral

/**
 * @param {{ session: () => ConfirmingSession | null, now?: () => number, waits?: Waits }} host
 *   session: the joined session, null before the join
 * @returns {DecisionConfirmation}
 */
// Stryker disable next-line ObjectLiteral: the tests that keep these waits answer at once; the times themselves are not observable there
export const createHostConfirmation = ({ session, now = Date.now, waits = WAITS }) => {
  const state = { session, now, waits, asked: /** @type {number[]} */ ([]) }
  return Object.freeze({ by: 'host-confirmed', confirm: (request) => confirm(state, request) })
}

/**
 * @param {{ session: () => ConfirmingSession | null, now: () => number, waits: Waits, asked: number[] }} state
 * @param {DecisionRequest} request @returns {Promise<Confirmed>}
 */
const confirm = async (state, request) => {
  const joined = state.session()
  const barred = await personBarred(joined, state.waits.modeMs)
  if (barred !== null) return refused(barred)
  if (!admitted(state)) return refused('rate-limited')
  const answer = await within(() => joined?.ui?.confirm?.(question(request)), state.waits.confirmMs)
  return answer === true ? { ok: true } : refused('not-confirmed')
}

/**
 * Why the session cannot put the question to a person, null when it can.
 * @param {ConfirmingSession | null} joined @param {number} modeMs
 * @returns {Promise<'no-elicitation' | 'mode-unknown' | 'autopilot' | null>}
 */
const personBarred = async (joined, modeMs) => {
  if (joined?.capabilities?.ui?.elicitation !== true) return 'no-elicitation'
  const mode = await within(() => joined.rpc?.mode?.get?.(), modeMs)
  if (typeof mode !== 'string') return 'mode-unknown'
  return mode === 'autopilot' ? 'autopilot' : null
}

/** The dialog's text: only values the engine checked. @param {DecisionRequest} request */
const question = ({ slug, key, answer }) => `skraft ${slug}: record ${answer} as your answer to ${key}?`

/**
 * Whether one more request fits the rate limit; an admitted one is counted.
 * @param {{ now: () => number, asked: number[] }} state @returns {boolean}
 */
const admitted = (state) => {
  const at = state.now()
  const recent = state.asked.filter((time) => at - time < RATE.windowMs)
  if (recent.some((time) => at - time < RATE.gapMs) || recent.length >= RATE.perWindow) return false
  state.asked.push(at)
  return true
}

/**
 * What the call answers within the time; TIMED_OUT past it, undefined when it throws. The timer
 * is cleared once answered.
 * @param {() => Promise<unknown> | undefined} call @param {number} ms @returns {Promise<unknown>}
 */
const within = async (call, ms) => {
  /** @type {NodeJS.Timeout | undefined} */
  let timer
  const late = new Promise((done) => { timer = setTimeout(() => done(TIMED_OUT), ms) })
  try {
    return await Promise.race([call(), late])
  } catch {
    // a call that throws gives no answer
  } finally {
    clearTimeout(timer)
  }
}

/** @param {keyof typeof REFUSALS} code @returns {Confirmed} */
const refused = (code) => ({ ok: false, code, reason: REFUSALS[code] })
